use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const LOCAL_GIT_TIMEOUT: Duration = Duration::from_secs(30);
const NETWORK_GIT_TIMEOUT: Duration = Duration::from_secs(60);
const GIT_OUTPUT_LIMIT: usize = 4096;
const UNSAFE_LOCAL_CONFIG: &str = r"^(include\.path|includeif\..*\.path|filter\..*\.(clean|smudge|process)|credential(\..+)?\.helper|core\.(askpass|sshcommand|editor|gitproxy|alternaterefscommand)|sequence\.editor|diff\.external|diff\..*\.(command|textconv)|merge\..*\.driver|remote\..*\.(uploadpack|receivepack))$";
static HOOK_DIRECTORY_NONCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncStatus {
    pub initialized: bool,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub has_remote: bool,
    pub remote_url: Option<String>,
    pub remote_safe: bool,
    pub ahead: u32,
    pub behind: u32,
    pub staged: u32,
    pub modified: u32,
    pub untracked: u32,
    pub conflicts: u32,
    pub dirty: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncResult {
    pub message: String,
    pub status: GitSyncStatus,
}

#[tauri::command(rename_all = "camelCase")]
pub fn git_sync_status(project_path: String) -> Result<GitSyncStatus, String> {
    status(&project_root(&project_path)?)
}

#[tauri::command(rename_all = "camelCase")]
pub fn git_sync_init(
    project_path: String,
    branch: String,
    remote_url: Option<String>,
) -> Result<GitSyncResult, String> {
    validate_branch(&branch)?;
    if let Some(url) = remote_url.as_deref() {
        validate_remote(url)?;
    }
    let root = project_root(&project_path)?;
    let created = !root.join(".git").exists();
    if created {
        run_git(&root, &["init", "--initial-branch", &branch])?;
    } else {
        ensure_repository(&root)?;
        require_branch(&root, &branch)?;
    }

    if let Some(url) = remote_url.as_deref() {
        let existing = origin_urls(&root, false)?;
        if existing.is_empty() {
            run_git(&root, &["remote", "add", "origin", url])?;
        } else if existing.len() != 1 || existing[0] != url {
            return Err(
                "Origin already points somewhere else; change it explicitly in Git before syncing."
                    .into(),
            );
        }
    }

    Ok(GitSyncResult {
        message: if created {
            "Git sync initialized.".into()
        } else {
            "Git sync is ready.".into()
        },
        status: status(&root)?,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn git_sync_pull(project_path: String, branch: String) -> Result<GitSyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || pull(project_path, branch))
        .await
        .map_err(|error| format!("Git pull worker failed: {error}"))?
}

fn pull(project_path: String, branch: String) -> Result<GitSyncResult, String> {
    validate_branch(&branch)?;
    let root = project_root(&project_path)?;
    ensure_repository(&root)?;
    require_branch(&root, &branch)?;
    require_idle_repository(&root)?;
    require_clean_repository(&root, "pulling")?;
    require_safe_origin(&root, false)?;
    run_git_network(
        &root,
        &["pull", "--ff-only", "--no-rebase", "origin", &branch],
    )?;
    Ok(GitSyncResult {
        message: format!("Pulled origin/{branch} with fast-forward only."),
        status: status(&root)?,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn git_sync_push(project_path: String, branch: String) -> Result<GitSyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || push(project_path, branch))
        .await
        .map_err(|error| format!("Git push worker failed: {error}"))?
}

fn push(project_path: String, branch: String) -> Result<GitSyncResult, String> {
    validate_branch(&branch)?;
    let root = project_root(&project_path)?;
    ensure_repository(&root)?;
    require_branch(&root, &branch)?;
    require_idle_repository(&root)?;
    require_clean_repository(&root, "pushing")?;
    require_safe_origin(&root, true)?;
    let refspec = format!("HEAD:refs/heads/{branch}");
    run_git_network(&root, &["push", "--set-upstream", "origin", &refspec])?;
    Ok(GitSyncResult {
        message: format!("Pushed the current draft to origin/{branch}."),
        status: status(&root)?,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn git_sync_commit(
    project_path: String,
    branch: String,
    message: String,
    author_name: String,
    author_email: String,
) -> Result<GitSyncResult, String> {
    validate_branch(&branch)?;
    validate_commit_identity(&author_name, &author_email)?;
    let message = message.trim();
    if message.is_empty() || message.len() > 500 || message.chars().any(char::is_control) {
        return Err("Enter a commit message of 1 to 500 characters.".into());
    }
    let root = project_root(&project_path)?;
    ensure_repository(&root)?;
    require_branch(&root, &branch)?;
    require_idle_repository(&root)?;
    if status(&root)?.conflicts > 0 {
        return Err("Resolve Git conflicts before saving a sync point.".into());
    }
    run_git(&root, &["add", "--force", "--", "scs.project.json"])?;
    run_git(&root, &["add", "--all", "--", "."])?;
    run_git(
        &root,
        &["ls-files", "--error-unmatch", "--", "scs.project.json"],
    )?;
    if !status(&root)?.dirty {
        return Ok(GitSyncResult {
            message: "The shared project already matches the latest local commit.".into(),
            status: status(&root)?,
        });
    }
    run_git_as(
        &root,
        &["commit", "-m", message],
        author_name.trim(),
        author_email.trim(),
    )?;
    Ok(GitSyncResult {
        message: "Saved a local Git sync point.".into(),
        status: status(&root)?,
    })
}

fn project_root(project_path: &str) -> Result<PathBuf, String> {
    let input = Path::new(project_path);
    if !input.is_absolute() {
        return Err("Choose an absolute SCS project path.".into());
    }
    let candidate = if input.file_name().and_then(|name| name.to_str()) == Some("scs.project.json")
    {
        input.parent().ok_or("Choose a project folder.")?
    } else {
        input
    };
    let root = fs::canonicalize(candidate)
        .map_err(|error| format!("Project folder could not be opened: {error}"))?;
    if !root.is_dir() || !root.join("scs.project.json").is_file() {
        return Err("Git sync requires a folder containing scs.project.json.".into());
    }
    Ok(root)
}

fn ensure_repository(root: &Path) -> Result<(), String> {
    if !root.join(".git").exists() {
        return Err("Git sync has not been initialized for this project.".into());
    }
    if run_git_optional(
        root,
        &[
            "config",
            "--local",
            "--name-only",
            "--get-regexp",
            UNSAFE_LOCAL_CONFIG,
        ],
    )?
    .is_some_and(|configured| !configured.is_empty())
    {
        return Err(
            "Repository-local Git command hooks, filters, and credential helpers are not supported by safe sync. Remove them before syncing."
                .into(),
        );
    }
    let top = run_git(root, &["rev-parse", "--show-toplevel"])?;
    let top = fs::canonicalize(top.trim())
        .map_err(|error| format!("Git repository root could not be verified: {error}"))?;
    if top != root {
        return Err("The Git repository must start at the SCS project folder.".into());
    }
    Ok(())
}

fn status(root: &Path) -> Result<GitSyncStatus, String> {
    if !root.join(".git").exists() {
        return Ok(GitSyncStatus::default());
    }
    ensure_repository(root)?;
    let output = run_git(
        root,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=normal",
        ],
    )?;
    let mut result = parse_status(&output);
    let fetch_urls = origin_urls(root, false)?;
    let push_urls = origin_urls(root, true)?;
    result.has_remote = !fetch_urls.is_empty();
    result.remote_safe = result.has_remote
        && fetch_urls
            .iter()
            .chain(&push_urls)
            .all(|url| validate_remote(url).is_ok());
    if result.remote_safe {
        result.remote_url = fetch_urls.first().cloned();
    }
    Ok(result)
}

fn parse_status(output: &str) -> GitSyncStatus {
    let mut status = GitSyncStatus {
        initialized: true,
        ..GitSyncStatus::default()
    };
    for line in output.lines() {
        if let Some(value) = line.strip_prefix("# branch.oid ") {
            if value != "(initial)" {
                status.head = Some(value.into());
            }
        } else if let Some(value) = line.strip_prefix("# branch.head ") {
            if value != "(detached)" {
                status.branch = Some(value.into());
            }
        } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
            status.upstream = Some(value.into());
        } else if let Some(value) = line.strip_prefix("# branch.ab ") {
            for count in value.split_whitespace() {
                if let Some(ahead) = count.strip_prefix('+') {
                    status.ahead = ahead.parse().unwrap_or(0);
                } else if let Some(behind) = count.strip_prefix('-') {
                    status.behind = behind.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            if let Some(xy) = line.split_whitespace().nth(1) {
                let mut state = xy.chars();
                status.staged += u32::from(state.next().is_some_and(|value| value != '.'));
                status.modified += u32::from(state.next().is_some_and(|value| value != '.'));
            }
        } else if line.starts_with("u ") {
            status.conflicts += 1;
        } else if line.starts_with("? ") {
            status.untracked += 1;
        }
    }
    status.dirty = status.staged + status.modified + status.untracked + status.conflicts > 0;
    status
}

fn require_branch(root: &Path, branch: &str) -> Result<(), String> {
    let current = run_git(root, &["branch", "--show-current"])?;
    if current.trim() != branch {
        return Err(format!("Switch to the '{branch}' branch before syncing."));
    }
    Ok(())
}

fn require_idle_repository(root: &Path) -> Result<(), String> {
    let git_dir = PathBuf::from(run_git(root, &["rev-parse", "--absolute-git-dir"])?);
    for marker in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "BISECT_LOG",
        "rebase-apply",
        "rebase-merge",
        "sequencer",
    ] {
        if git_dir.join(marker).exists() {
            return Err(
                "Finish or abort the current Git merge, rebase, cherry-pick, revert, or bisect before syncing."
                    .into(),
            );
        }
    }
    Ok(())
}

fn require_clean_repository(root: &Path, action: &str) -> Result<(), String> {
    let current = status(root)?;
    if current.dirty || current.conflicts > 0 {
        return Err(format!(
            "Save a clean Git sync point before {action} the remote project."
        ));
    }
    Ok(())
}

fn origin_urls(root: &Path, push: bool) -> Result<Vec<String>, String> {
    if !run_git(root, &["remote"])?
        .lines()
        .any(|remote| remote == "origin")
    {
        return Ok(Vec::new());
    }
    let args: &[&str] = if push {
        &["remote", "get-url", "--push", "--all", "origin"]
    } else {
        &["remote", "get-url", "--all", "origin"]
    };
    Ok(run_git(root, args)?
        .lines()
        .filter(|url| !url.is_empty())
        .map(str::to_owned)
        .collect())
}

fn require_safe_origin(root: &Path, push: bool) -> Result<(), String> {
    let urls = origin_urls(root, push)?;
    if urls.is_empty() {
        return Err("Add an HTTPS origin before syncing.".into());
    }
    for url in &urls {
        validate_remote(url)?;
    }
    Ok(())
}

fn validate_remote(url: &str) -> Result<(), String> {
    let rest = url
        .strip_prefix("https://")
        .ok_or("Only credential-free HTTPS Git origins are supported.")?;
    let (host, path) = rest
        .split_once('/')
        .ok_or("The Git origin must include a host and repository path.")?;
    if host.is_empty()
        || host.contains('@')
        || path.is_empty()
        || url.chars().any(char::is_whitespace)
        || url.contains(['\\', '?', '#'])
    {
        return Err(
            "Use a credential-free HTTPS Git origin and the system credential manager.".into(),
        );
    }
    Ok(())
}

fn validate_branch(branch: &str) -> Result<(), String> {
    if branch.is_empty()
        || branch.trim() != branch
        || branch.starts_with('-')
        || branch.len() > 255
        || branch.chars().any(char::is_control)
    {
        return Err("Choose a valid Git branch name.".into());
    }
    let output = git_command()
        .args(["check-ref-format", "--branch", branch])
        .output()
        .map_err(|error| format!("Git could not be started: {error}"))?;
    if !output.status.success() {
        return Err("Choose a valid Git branch name.".into());
    }
    Ok(())
}

fn validate_commit_identity(name: &str, email: &str) -> Result<(), String> {
    let name = name.trim();
    let email = email.trim();
    if name.is_empty()
        || name.len() > 200
        || name.chars().any(char::is_control)
        || email.is_empty()
        || email.len() > 254
        || email.chars().any(char::is_control)
        || email.chars().any(char::is_whitespace)
        || !email.contains('@')
    {
        return Err("Enter a valid Git author name and email.".into());
    }
    Ok(())
}

fn run_git(root: &Path, args: &[&str]) -> Result<String, String> {
    run_git_with(root, args, LOCAL_GIT_TIMEOUT, None)
}

fn run_git_network(root: &Path, args: &[&str]) -> Result<String, String> {
    run_git_with(root, args, NETWORK_GIT_TIMEOUT, None)
}

fn run_git_as(root: &Path, args: &[&str], name: &str, email: &str) -> Result<String, String> {
    run_git_with(root, args, LOCAL_GIT_TIMEOUT, Some((name, email)))
}

fn run_git_optional(root: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let operation = args.first().copied().unwrap_or("command");
    let output = execute_git(root, args, LOCAL_GIT_TIMEOUT, None, operation)?;
    if output.status.success() {
        Ok(Some(clean_output(&output.stdout)))
    } else if output.status.code() == Some(1) {
        Ok(None)
    } else {
        Err(output_error(&output, operation))
    }
}

fn run_git_with(
    root: &Path,
    args: &[&str],
    timeout: Duration,
    identity: Option<(&str, &str)>,
) -> Result<String, String> {
    let operation = args.first().copied().unwrap_or("command");
    let output = execute_git(root, args, timeout, identity, operation)?;
    if output.status.success() {
        Ok(clean_output(&output.stdout))
    } else {
        Err(output_error(&output, operation))
    }
}

fn execute_git(
    root: &Path,
    args: &[&str],
    timeout: Duration,
    identity: Option<(&str, &str)>,
    operation: &str,
) -> Result<GitOutput, String> {
    let hooks = EmptyHooksDirectory::new()?;
    let hooks_config = format!("core.hooksPath={}", hooks.path.display());
    let mut command = git_command();
    command
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .args([
            "-c",
            &hooks_config,
            "-c",
            "core.fsmonitor=false",
            "-c",
            "commit.gpgSign=false",
            "-c",
            "push.gpgSign=false",
            "-c",
            "merge.verifySignatures=false",
        ])
        .args(args);
    if let Some((name, email)) = identity {
        command
            .env("GIT_AUTHOR_NAME", name)
            .env("GIT_AUTHOR_EMAIL", email)
            .env("GIT_COMMITTER_NAME", name)
            .env("GIT_COMMITTER_EMAIL", email);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Git could not be started: {error}"))?;
    let (stdout, stdout_done) = capture_stream(
        child
            .stdout
            .take()
            .ok_or("Git stdout could not be captured.")?,
    );
    let (stderr, stderr_done) = capture_stream(
        child
            .stderr
            .take()
            .ok_or("Git stderr could not be captured.")?,
    );
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Git {operation} could not be monitored: {error}"))?
        {
            break status;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_done.recv_timeout(Duration::from_millis(250));
            let _ = stderr_done.recv_timeout(Duration::from_millis(250));
            return Err(format!(
                "Git {operation} timed out after {} seconds.",
                timeout.as_secs()
            ));
        }
        thread::sleep(Duration::from_millis(20));
    };
    let _ = stdout_done.recv_timeout(Duration::from_millis(500));
    let _ = stderr_done.recv_timeout(Duration::from_millis(500));
    Ok(GitOutput {
        status,
        stdout: captured(&stdout),
        stderr: captured(&stderr),
    })
}

fn git_command() -> Command {
    let mut command = Command::new("git");
    for variable in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_COMMON_DIR",
        "GIT_NAMESPACE",
        "GIT_CEILING_DIRECTORIES",
        "GIT_DISCOVERY_ACROSS_FILESYSTEM",
        "GIT_CONFIG_PARAMETERS",
        "GIT_CONFIG_COUNT",
        "GIT_CONFIG_SYSTEM",
        "GIT_CONFIG_GLOBAL",
        "GIT_CONFIG_NOSYSTEM",
        "GIT_EXEC_PATH",
        "GIT_EXTERNAL_DIFF",
        "GIT_DIFF_OPTS",
        "GIT_SSH",
        "GIT_SSH_COMMAND",
        "GIT_PROXY_COMMAND",
        "GIT_ASKPASS",
        "GIT_EDITOR",
        "GIT_SEQUENCE_EDITOR",
        "GIT_MERGE_AUTOEDIT",
        "GIT_AUTHOR_NAME",
        "GIT_AUTHOR_EMAIL",
        "GIT_AUTHOR_DATE",
        "GIT_COMMITTER_NAME",
        "GIT_COMMITTER_EMAIL",
        "GIT_COMMITTER_DATE",
        "EMAIL",
    ] {
        command.env_remove(variable);
    }
    for (variable, _) in std::env::vars_os() {
        if variable.to_string_lossy().starts_with("GIT_CONFIG_KEY_")
            || variable.to_string_lossy().starts_with("GIT_CONFIG_VALUE_")
        {
            command.env_remove(variable);
        }
    }
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_ALLOW_PROTOCOL", "https")
        .env("GIT_ATTR_NOSYSTEM", "1")
        .env("GIT_PAGER", "cat")
        .env("LC_ALL", "C");
    command
}

fn capture_stream<R: Read + Send + 'static>(mut stream: R) -> (CapturedOutput, mpsc::Receiver<()>) {
    let captured = Arc::new(Mutex::new(Vec::with_capacity(GIT_OUTPUT_LIMIT)));
    let writer = Arc::clone(&captured);
    let (done_tx, done_rx) = mpsc::channel();
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    if let Ok(mut output) = writer.lock() {
                        let available = GIT_OUTPUT_LIMIT.saturating_sub(output.len());
                        output.extend_from_slice(&buffer[..read.min(available)]);
                    }
                }
            }
        }
        let _ = done_tx.send(());
    });
    (captured, done_rx)
}

fn captured(output: &CapturedOutput) -> Vec<u8> {
    output.lock().map(|value| value.clone()).unwrap_or_default()
}

fn output_error(output: &GitOutput, operation: &str) -> String {
    let detail = clean_output(&output.stderr);
    if detail.is_empty() {
        format!("Git {operation} failed.")
    } else {
        format!("Git {operation} failed: {detail}")
    }
}

fn clean_output(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .chars()
        .filter(|value| !value.is_control() || matches!(value, '\n' | '\t'))
        .take(4000)
        .collect::<String>()
        .trim()
        .to_owned()
}

type CapturedOutput = Arc<Mutex<Vec<u8>>>;

struct GitOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

struct EmptyHooksDirectory {
    path: PathBuf,
}

impl EmptyHooksDirectory {
    fn new() -> Result<Self, String> {
        for _ in 0..8 {
            let nonce = HOOK_DIRECTORY_NONCE.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "scs-empty-hooks-{}-{timestamp}-{nonce}",
                std::process::id()
            ));
            match fs::create_dir(&path) {
                Ok(()) => {
                    let path = fs::canonicalize(&path).map_err(|error| {
                        format!("The safe Git hooks directory could not be verified: {error}")
                    })?;
                    return Ok(Self { path });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(format!(
                        "A safe Git hooks directory could not be created: {error}"
                    ));
                }
            }
        }
        Err("A unique safe Git hooks directory could not be created.".into())
    }
}

impl Drop for EmptyHooksDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn project(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("scs-git-{label}-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("scs.project.json"), "{}\n").unwrap();
        root
    }

    #[test]
    fn parses_porcelain_status_counts() {
        let status = parse_status(
            "# branch.oid abc123\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n1 M. N... 100644 100644 100644 a b file\n1 .M N... 100644 100644 100644 a b other\nu UU N... 100644 100644 100644 100644 a b c conflict\n? new file\n",
        );
        assert_eq!(status.branch.as_deref(), Some("main"));
        assert_eq!((status.ahead, status.behind), (2, 1));
        assert_eq!((status.staged, status.modified), (1, 1));
        assert_eq!((status.conflicts, status.untracked), (1, 1));
        assert!(status.dirty);
    }

    #[test]
    fn initializes_only_the_selected_project_root() {
        let root = project("init");
        let result = git_sync_init(root.display().to_string(), "main".into(), None).unwrap();
        assert!(result.status.initialized);
        assert_eq!(result.status.branch.as_deref(), Some("main"));
        assert!(root.join(".git").exists());
        assert_eq!(
            git_sync_status(root.join("scs.project.json").display().to_string())
                .unwrap()
                .branch
                .as_deref(),
            Some("main")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_unsafe_remotes_and_non_project_folders() {
        assert!(validate_remote("https://github.com/example/project.git").is_ok());
        assert!(validate_remote("ext::sh -c bad").is_err());
        assert!(validate_remote("https://token@github.com/example/project.git").is_err());
        assert!(project_root("relative/project").is_err());
        assert!(validate_branch("--upload-pack=bad").is_err());

        let root = project("unsafe-origin");
        git_sync_init(root.display().to_string(), "main".into(), None).unwrap();
        run_git(
            &root,
            &[
                "remote",
                "add",
                "origin",
                "https://token@github.com/example/project.git",
            ],
        )
        .unwrap();
        let status = git_sync_status(root.display().to_string()).unwrap();
        assert!(status.has_remote);
        assert!(!status.remote_safe);
        assert_eq!(status.remote_url, None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn commits_only_inside_the_selected_project() {
        let root = project("commit");
        git_sync_init(root.display().to_string(), "main".into(), None).unwrap();
        fs::write(root.join(".gitignore"), "scs.project.json\n").unwrap();
        run_git(&root, &["config", "commit.gpgSign", "true"]).unwrap();
        let hook = root.join(".git/hooks/pre-commit");
        fs::write(&hook, "#!/bin/sh\nprintf bad > hook-ran\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let committed = git_sync_commit(
            root.display().to_string(),
            "main".into(),
            "Save draft".into(),
            "Test Writer".into(),
            "writer@scs.local".into(),
        )
        .unwrap();
        assert!(committed.status.head.is_some());
        assert!(!committed.status.dirty);
        assert!(!root.join("hook-ran").exists());
        assert_eq!(
            run_git(&root, &["ls-files", "--", "scs.project.json"]).unwrap(),
            "scs.project.json"
        );
        assert_eq!(
            run_git(&root, &["show", "-s", "--format=%an|%ae|%cn|%ce", "HEAD"]).unwrap(),
            "Test Writer|writer@scs.local|Test Writer|writer@scs.local"
        );
        fs::write(root.join("scs.project.json"), "{\"changed\":true}\n").unwrap();
        assert!(git_sync_status(root.display().to_string()).unwrap().dirty);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_repository_operations_and_dirty_remote_sync() {
        let root = project("guarded");
        git_sync_init(
            root.display().to_string(),
            "main".into(),
            Some("https://github.com/example/project.git".into()),
        )
        .unwrap();
        git_sync_commit(
            root.display().to_string(),
            "main".into(),
            "Initial project".into(),
            "Test Writer".into(),
            "writer@scs.local".into(),
        )
        .unwrap();
        let head = run_git(&root, &["rev-parse", "HEAD"]).unwrap();
        fs::write(root.join(".git/MERGE_HEAD"), format!("{head}\n")).unwrap();
        let operation_error = git_sync_commit(
            root.display().to_string(),
            "main".into(),
            "Unsafe merge".into(),
            "Test Writer".into(),
            "writer@scs.local".into(),
        )
        .unwrap_err();
        assert!(operation_error.contains("Finish or abort"));
        fs::remove_file(root.join(".git/MERGE_HEAD")).unwrap();

        fs::write(root.join("scs.project.json"), "{\"dirty\":true}\n").unwrap();
        assert!(pull(root.display().to_string(), "main".into())
            .unwrap_err()
            .contains("clean Git sync point"));
        assert!(push(root.display().to_string(), "main".into())
            .unwrap_err()
            .contains("clean Git sync point"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_repository_filter_processes_and_bounds_output() {
        let root = project("filter");
        git_sync_init(root.display().to_string(), "main".into(), None).unwrap();
        run_git(
            &root,
            &[
                "config",
                "--local",
                "filter.unsafe.clean",
                "dangerous-filter",
            ],
        )
        .unwrap();
        assert!(git_sync_status(root.display().to_string())
            .unwrap_err()
            .contains("command hooks"));

        let (output_buffer, done) = capture_stream(Cursor::new(vec![b'x'; GIT_OUTPUT_LIMIT + 128]));
        done.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(captured(&output_buffer).len(), GIT_OUTPUT_LIMIT);
        assert!(git_command()
            .get_envs()
            .any(|(key, value)| { key == "GIT_DIR" && value.is_none() }));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_repository_local_command_execution_config_without_running_it() {
        for (label, key, value) in [
            (
                "credential-helper",
                "credential.helper",
                "!echo unsafe > unsafe-config-ran",
            ),
            (
                "askpass",
                "core.askPass",
                "!echo unsafe > unsafe-config-ran",
            ),
            (
                "ssh-command",
                "core.sshCommand",
                "!echo unsafe > unsafe-config-ran",
            ),
            ("config-include", "include.path", "safe-include.config"),
        ] {
            let root = project(label);
            git_sync_init(root.display().to_string(), "main".into(), None).unwrap();
            let sentinel = root.join("unsafe-config-ran");
            if key == "include.path" {
                fs::write(root.join(".git/safe-include.config"), "").unwrap();
            }
            run_git(&root, &["config", "--local", key, value]).unwrap();
            let error = if key == "credential.helper" {
                push(root.display().to_string(), "main".into()).unwrap_err()
            } else {
                git_sync_status(root.display().to_string()).unwrap_err()
            };
            assert!(
                error.contains("Repository-local Git command hooks"),
                "{label}: {error}"
            );
            assert!(!sentinel.exists());
            let _ = fs::remove_dir_all(root);
        }
    }
}
