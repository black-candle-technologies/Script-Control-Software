import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Launcher, { type DocChoice } from "./components/Launcher.tsx";
import Workspace from "./components/Workspace.tsx";
import { createProjectSession, defaultAppInfo, emptyDocument, type AppInfo, type ProjectSession } from "./domain/index.ts";
import { sampleScreenplay } from "./domain/sample.ts";
import { loadSession } from "./storage.ts";
import { chooseAndOpenProject, chooseAndParseFdx, messageFrom } from "./services/fdxService.ts";
import { passesBeforeReplace, type BeforeReplace } from "./services/fdxImportGate.ts";
import { getCoordinatorSnapshot } from "./services/nativeWorkspaceService.ts";
import { nativeWorkspaceAvailable, parseWorkspaceBootstrap } from "./services/workspaceIdentity.ts";
import "./App.css";

type View = "launcher" | "write";

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo);
  const [view, setView] = useState<View>("launcher");
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [docNonce, setDocNonce] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    // Ask the Rust command layer who we are. Falls back to static metadata when
    // the UI is rendered outside the Tauri shell (e.g. a plain browser preview).
    invoke<AppInfo>("get_app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(defaultAppInfo));
    const bootstrap = parseWorkspaceBootstrap(globalThis.location.search);
    if (bootstrap && nativeWorkspaceAvailable()) {
      setImporting(true);
      void getCoordinatorSnapshot(bootstrap.projectId, bootstrap.sessionId)
        .then((snapshot) => {
          setSession(snapshot.session);
          setDocNonce((nonce) => nonce + 1);
          setView("write");
        })
        .catch((error) => setImportError(messageFrom(error)))
        .finally(() => setImporting(false));
    }
  }, []);

  const open = (choice: DocChoice) => {
    if (!confirmProjectReplacement(Boolean(session), choice !== "saved")) return;
    const next =
      choice === "saved"
        ? loadSession() ?? createProjectSession(sampleScreenplay())
        : choice === "sample"
          ? createProjectSession(sampleScreenplay())
          : createProjectSession(
              emptyDocument(choice === "new-show" ? "Untitled Episode" : "Untitled Screenplay"),
              choice === "new-show" ? "television" : "featureFilm",
            );
    if (choice === "new-show") next.name = "Untitled Show";
    setSession(next);
    setDocNonce((n) => n + 1);
    setView("write");
  };

  const savedTitle = view === "launcher" ? loadSession()?.name || null : null;

  const openFdx = async (beforeReplace?: BeforeReplace) => {
    if (!confirmProjectReplacement(Boolean(session))) return;
    setImporting(true);
    setImportError(null);
    try {
      const imported = await chooseAndParseFdx();
      if (!imported) return;
      if (!(await passesBeforeReplace(beforeReplace))) return;
      setSession(createProjectSession(imported));
      setDocNonce((n) => n + 1);
      setView("write");
    } catch (error) {
      setImportError(messageFrom(error));
      setView("launcher");
    } finally {
      setImporting(false);
    }
  };

  const openProject = async () => {
    if (!confirmProjectReplacement(Boolean(session))) return;
    setImporting(true);
    setImportError(null);
    try {
      const project = await chooseAndOpenProject();
      if (!project) return;
      setSession(project);
      setDocNonce((nonce) => nonce + 1);
      setView("write");
    } catch (error) {
      setImportError(messageFrom(error));
    } finally {
      setImporting(false);
    }
  };

  return view === "write" && session ? (
    <Workspace key={docNonce} initialSession={session} onOpenFdx={openFdx} onExit={() => setView("launcher")} />
  ) : (
    <Launcher
      appInfo={appInfo}
      savedTitle={savedTitle}
      onOpen={open}
      onOpenFdx={openFdx}
      onOpenProject={openProject}
      importError={importError}
      importing={importing}
    />
  );
}

function confirmProjectReplacement(hasActiveSession: boolean, protectLocalRecovery = true): boolean {
  return (!hasActiveSession && (!protectLocalRecovery || !loadSession()))
    || window.confirm("Open a different project? Your current local recovery will be replaced when the new project autosaves. Save a portable copy first if you need to keep both.");
}

export default App;
