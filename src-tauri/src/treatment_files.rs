use flate2::read::DeflateDecoder;
use serde::Serialize;
use std::{
    fs,
    io::{self, Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

const MAX_TREATMENT_FILE_SIZE: u64 = 25 * 1024 * 1024;
const MAX_DOCX_EXPANDED_SIZE: u64 = 100 * 1024 * 1024;
const MAX_DOCX_ENTRIES: usize = 2_048;
static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TreatmentFileFormat {
    Markdown,
    Docx,
    Pdf,
}

impl TreatmentFileFormat {
    fn from_path(path: &Path) -> Result<Self, String> {
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default();
        if extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown") {
            Ok(Self::Markdown)
        } else if extension.eq_ignore_ascii_case("docx") {
            Ok(Self::Docx)
        } else if extension.eq_ignore_ascii_case("pdf") {
            Ok(Self::Pdf)
        } else {
            Err("Choose a Markdown, Word (.docx), or PDF treatment file.".into())
        }
    }

    fn from_name(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "md" | "markdown" => Ok(Self::Markdown),
            "docx" => Ok(Self::Docx),
            "pdf" => Ok(Self::Pdf),
            _ => Err("Treatment format must be md, docx, or pdf.".into()),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Markdown => "md",
            Self::Docx => "docx",
            Self::Pdf => "pdf",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreatmentFilePayload {
    pub path: String,
    pub file_name: String,
    pub format: String,
    pub contents: Vec<u8>,
}

#[tauri::command]
pub fn read_treatment_file(path: String) -> Result<TreatmentFilePayload, String> {
    let requested = absolute_path(&path)?;
    reject_symlink(&requested, "Treatment imports cannot use symbolic links.")?;
    let canonical = fs::canonicalize(&requested)
        .map_err(|error| format!("Treatment file could not be accessed: {error}"))?;
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Treatment file could not be inspected: {error}"))?;
    if !metadata.is_file() {
        return Err("Choose an existing treatment file.".into());
    }
    if metadata.len() > MAX_TREATMENT_FILE_SIZE {
        return Err("Treatment files must be 25 MB or smaller.".into());
    }

    let format = TreatmentFileFormat::from_path(&canonical)?;
    let contents = fs::read(&canonical)
        .map_err(|error| format!("Treatment file could not be read: {error}"))?;
    validate_contents(format, &contents)?;

    Ok(TreatmentFilePayload {
        file_name: canonical
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("treatment.md")
            .to_string(),
        path: requested.to_string_lossy().to_string(),
        format: format.name().to_string(),
        contents,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn write_treatment_file(
    path: String,
    format: String,
    contents: Vec<u8>,
) -> Result<String, String> {
    let requested = absolute_path(&path)?;
    let requested_format = TreatmentFileFormat::from_path(&requested)?;
    let declared_format = TreatmentFileFormat::from_name(&format)?;
    if requested_format != declared_format {
        return Err("The treatment filename extension does not match the selected format.".into());
    }
    if contents.len() as u64 > MAX_TREATMENT_FILE_SIZE {
        return Err("Treatment exports must be 25 MB or smaller.".into());
    }
    validate_contents(declared_format, &contents)?;

    let parent = requested
        .parent()
        .ok_or_else(|| "Choose an existing export folder.".to_string())?;
    let parent = fs::canonicalize(parent)
        .map_err(|error| format!("Treatment export folder could not be accessed: {error}"))?;
    if !parent.is_dir() {
        return Err("Choose an existing export folder.".into());
    }
    let file_name = requested
        .file_name()
        .ok_or_else(|| "Choose a treatment filename.".to_string())?;
    let target = parent.join(file_name);
    reject_symlink(&target, "Treatment exports cannot replace symbolic links.")?;
    if fs::metadata(&target).is_ok_and(|metadata| !metadata.is_file()) {
        return Err("The treatment export target must be a file.".into());
    }

    atomic_replace(&target, |file| file.write_all(&contents))
        .map_err(|error| format!("Treatment export could not be written: {error}"))?;
    Ok(requested.to_string_lossy().to_string())
}

fn atomic_replace<F>(target: &Path, prepare: F) -> io::Result<()>
where
    F: FnOnce(&mut fs::File) -> io::Result<()>,
{
    let parent = target.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "export target has no parent folder",
        )
    })?;
    let mut temporary = None;
    for _ in 0..64 {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".scs-treatment-{}-{counter}.tmp",
            std::process::id()
        ));
        match fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&candidate)
        {
            Ok(file) => {
                temporary = Some((candidate, file));
                break;
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    let (temporary_path, mut file) = temporary.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::AlreadyExists,
            "a unique temporary export file could not be created",
        )
    })?;

    if let Err(error) = prepare(&mut file).and_then(|()| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    drop(file);

    if let Err(error) = fs::rename(&temporary_path, target) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    sync_parent(target)
}

#[cfg(unix)]
fn sync_parent(path: &Path) -> io::Result<()> {
    fs::File::open(path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "export target has no parent folder",
        )
    })?)?
    .sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_path: &Path) -> io::Result<()> {
    Ok(())
}

fn absolute_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value.trim());
    if value.trim().is_empty() || !path.is_absolute() {
        return Err("Choose an absolute treatment file path.".into());
    }
    Ok(path)
}

fn reject_symlink(path: &Path, message: &str) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(message.into()),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Treatment path could not be inspected: {error}")),
    }
}

fn validate_contents(format: TreatmentFileFormat, contents: &[u8]) -> Result<(), String> {
    if contents.is_empty() {
        return Err("The treatment file is empty.".into());
    }
    match format {
        TreatmentFileFormat::Markdown => {
            let text = std::str::from_utf8(contents)
                .map_err(|_| "Markdown treatments must use UTF-8 text.".to_string())?;
            if text.contains('\0') {
                return Err("Markdown treatments cannot contain null bytes.".into());
            }
        }
        TreatmentFileFormat::Docx => {
            validate_docx(contents)?;
        }
        TreatmentFileFormat::Pdf => {
            let header = &contents[..contents.len().min(1024)];
            if !contains_bytes(header, b"%PDF-") || !contains_bytes(contents, b"%%EOF") {
                return Err("The selected PDF treatment is not a valid PDF document.".into());
            }
        }
    }
    Ok(())
}

fn validate_docx(contents: &[u8]) -> Result<(), String> {
    if !contents.starts_with(b"PK\x03\x04") {
        return Err("The selected Word treatment is not a valid .docx package.".into());
    }
    let eocd_search_start = contents.len().saturating_sub(65_557);
    let eocd = (eocd_search_start..=contents.len().saturating_sub(22))
        .rev()
        .find(|position| {
            contents.get(*position..*position + 4) == Some(b"PK\x05\x06")
                && read_u16(contents, *position + 20)
                    .ok()
                    .and_then(|length| position.checked_add(22 + usize::from(length)))
                    == Some(contents.len())
        })
        .ok_or_else(|| "The selected Word treatment has no ZIP directory.".to_string())?;
    let disk_number = read_u16(contents, eocd + 4)?;
    let directory_disk = read_u16(contents, eocd + 6)?;
    let disk_entries = read_u16(contents, eocd + 8)?;
    let entries = usize::from(read_u16(contents, eocd + 10)?);
    let directory_size = read_u32(contents, eocd + 12)? as usize;
    let directory_offset = read_u32(contents, eocd + 16)? as usize;
    if disk_number != 0
        || directory_disk != 0
        || usize::from(disk_entries) != entries
        || entries == usize::from(u16::MAX)
        || directory_size == u32::MAX as usize
        || directory_offset == u32::MAX as usize
    {
        return Err("Multi-disk and ZIP64 Word treatments are not supported.".into());
    }
    if entries == 0 || entries > MAX_DOCX_ENTRIES {
        return Err("Word treatments must contain between 1 and 2048 files.".into());
    }
    let directory_end = directory_offset
        .checked_add(directory_size)
        .filter(|end| *end <= eocd && *end <= contents.len())
        .ok_or_else(|| "The selected Word treatment has a damaged ZIP directory.".to_string())?;

    let mut cursor = directory_offset;
    let mut expanded_size = 0u64;
    let mut has_content_types = false;
    let mut has_document = false;
    let mut names = std::collections::HashSet::<Vec<u8>>::new();

    for _ in 0..entries {
        let offset = cursor;
        if offset + 46 > contents.len() {
            return Err("The selected Word treatment has a damaged ZIP directory.".into());
        }
        if &contents[offset..offset + 4] != b"PK\x01\x02" {
            return Err("The selected Word treatment has a damaged ZIP directory.".into());
        }
        let flags = read_u16(contents, offset + 8)?;
        let method = read_u16(contents, offset + 10)?;
        let compressed = read_u32(contents, offset + 20)?;
        let uncompressed = read_u32(contents, offset + 24)?;
        let local_offset = read_u32(contents, offset + 42)?;
        if compressed == u32::MAX || uncompressed == u32::MAX || local_offset == u32::MAX {
            return Err("ZIP64 Word treatments are not supported.".into());
        }
        if flags & 1 != 0 {
            return Err("Encrypted Word treatments are not supported.".into());
        }
        if method != 0 && method != 8 {
            return Err("The Word treatment uses an unsupported ZIP compression method.".into());
        }
        if u64::from(uncompressed) > MAX_DOCX_EXPANDED_SIZE - expanded_size {
            return Err("Word treatments must expand to 100 MB or less.".into());
        }

        let name_length = usize::from(read_u16(contents, offset + 28)?);
        let extra_length = usize::from(read_u16(contents, offset + 30)?);
        let comment_length = usize::from(read_u16(contents, offset + 32)?);
        let name_start = offset + 46;
        let next = name_start
            .checked_add(name_length)
            .and_then(|value| value.checked_add(extra_length))
            .and_then(|value| value.checked_add(comment_length))
            .filter(|value| *value <= directory_end)
            .ok_or_else(|| {
                "The selected Word treatment has a damaged ZIP directory.".to_string()
            })?;
        let name = &contents[name_start..name_start + name_length];
        if !names.insert(name.to_vec()) {
            return Err("The selected Word treatment contains duplicate ZIP entries.".into());
        }
        let actual_size = validate_docx_entry(
            contents,
            directory_offset,
            local_offset as usize,
            name,
            flags,
            method,
            compressed,
            uncompressed,
            MAX_DOCX_EXPANDED_SIZE - expanded_size,
        )?;
        expanded_size += actual_size;
        has_content_types |= name == b"[Content_Types].xml";
        has_document |= name == b"word/document.xml";
        cursor = next;
    }

    if cursor != directory_end || !has_content_types || !has_document {
        return Err("The selected Word treatment is not a valid .docx package.".into());
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn validate_docx_entry(
    contents: &[u8],
    directory_offset: usize,
    local_offset: usize,
    expected_name: &[u8],
    expected_flags: u16,
    expected_method: u16,
    compressed_size: u32,
    declared_size: u32,
    remaining_limit: u64,
) -> Result<u64, String> {
    let damaged = || "The selected Word treatment has a damaged ZIP entry.".to_string();
    if contents.get(local_offset..local_offset + 4) != Some(b"PK\x03\x04") {
        return Err(damaged());
    }
    let local_flags = read_u16(contents, local_offset + 6)?;
    let local_method = read_u16(contents, local_offset + 8)?;
    if local_flags != expected_flags || local_method != expected_method {
        return Err(damaged());
    }
    if expected_flags & 8 == 0
        && (read_u32(contents, local_offset + 18)? != compressed_size
            || read_u32(contents, local_offset + 22)? != declared_size)
    {
        return Err(damaged());
    }
    let name_length = usize::from(read_u16(contents, local_offset + 26)?);
    let extra_length = usize::from(read_u16(contents, local_offset + 28)?);
    let name_start = local_offset.checked_add(30).ok_or_else(damaged)?;
    let data_start = name_start
        .checked_add(name_length)
        .and_then(|value| value.checked_add(extra_length))
        .ok_or_else(damaged)?;
    let data_end = data_start
        .checked_add(compressed_size as usize)
        .filter(|end| *end <= directory_offset && *end <= contents.len())
        .ok_or_else(damaged)?;
    if contents.get(name_start..name_start + name_length) != Some(expected_name) {
        return Err(damaged());
    }

    let data = &contents[data_start..data_end];
    let inspection_limit = u64::from(declared_size)
        .saturating_add(1)
        .min(remaining_limit.saturating_add(1));
    let actual_size = if expected_method == 0 {
        count_expanded(Cursor::new(data), inspection_limit)?
    } else {
        let mut decoder = DeflateDecoder::new(Cursor::new(data));
        let size = count_expanded(&mut decoder, inspection_limit)?;
        if decoder.total_in() != u64::from(compressed_size) {
            return Err(damaged());
        }
        size
    };
    if actual_size != u64::from(declared_size) {
        return Err("The selected Word treatment has incorrect ZIP expansion sizes.".into());
    }
    Ok(actual_size)
}

fn count_expanded<R: Read>(mut reader: R, limit: u64) -> Result<u64, String> {
    let mut buffer = [0u8; 8 * 1024];
    let mut total = 0u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| "The selected Word treatment has damaged compressed data.".to_string())?;
        if read == 0 {
            return Ok(total);
        }
        total = total.checked_add(read as u64).ok_or_else(|| {
            "The Word treatment expands beyond the safe import limit.".to_string()
        })?;
        if total > limit {
            return Err("The Word treatment expands beyond the safe import limit.".into());
        }
    }
}

fn read_u16(contents: &[u8], offset: usize) -> Result<u16, String> {
    contents
        .get(offset..offset + 2)
        .and_then(|value| value.try_into().ok())
        .map(u16::from_le_bytes)
        .ok_or_else(|| "The selected Word treatment has a damaged ZIP directory.".to_string())
}

fn read_u32(contents: &[u8], offset: usize) -> Result<u32, String> {
    contents
        .get(offset..offset + 4)
        .and_then(|value| value.try_into().ok())
        .map(u32::from_le_bytes)
        .ok_or_else(|| "The selected Word treatment has a damaged ZIP directory.".to_string())
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty()
        && haystack
            .windows(needle.len())
            .any(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::DeflateEncoder, Compression};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestFolder(PathBuf);

    impl TestFolder {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "script-control-treatment-files-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestFolder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn fixture_docx(
        document: &[u8],
        compress_document: bool,
        declared_size: Option<u32>,
    ) -> Vec<u8> {
        let entries = [
            ("[Content_Types].xml", b"<Types/>".as_slice(), false, None),
            (
                "word/document.xml",
                document,
                compress_document,
                declared_size,
            ),
        ];
        let mut bytes = Vec::new();
        let mut central_entries = Vec::new();
        for (name, data, compressed, declared_size) in entries {
            let method = if compressed { 8u16 } else { 0u16 };
            let stored = if compressed {
                let mut encoder = DeflateEncoder::new(Vec::new(), Compression::fast());
                encoder.write_all(data).unwrap();
                encoder.finish().unwrap()
            } else {
                data.to_vec()
            };
            let expanded = declared_size.unwrap_or(data.len() as u32);
            let compressed_size = stored.len() as u32;
            let local_offset = bytes.len() as u32;
            let mut local = vec![0u8; 30];
            local[..4].copy_from_slice(b"PK\x03\x04");
            local[4..6].copy_from_slice(&20u16.to_le_bytes());
            local[8..10].copy_from_slice(&method.to_le_bytes());
            local[18..22].copy_from_slice(&compressed_size.to_le_bytes());
            local[22..26].copy_from_slice(&expanded.to_le_bytes());
            local[26..28].copy_from_slice(&(name.len() as u16).to_le_bytes());
            bytes.extend(local);
            bytes.extend(name.as_bytes());
            bytes.extend(stored);

            let mut central = vec![0u8; 46];
            central[..4].copy_from_slice(b"PK\x01\x02");
            central[4..6].copy_from_slice(&20u16.to_le_bytes());
            central[6..8].copy_from_slice(&20u16.to_le_bytes());
            central[10..12].copy_from_slice(&method.to_le_bytes());
            central[20..24].copy_from_slice(&compressed_size.to_le_bytes());
            central[24..28].copy_from_slice(&expanded.to_le_bytes());
            central[28..30].copy_from_slice(&(name.len() as u16).to_le_bytes());
            central[42..46].copy_from_slice(&local_offset.to_le_bytes());
            central.extend(name.as_bytes());
            central_entries.push(central);
        }

        let directory_offset = bytes.len() as u32;
        for entry in &central_entries {
            bytes.extend(entry);
        }
        let directory_size = bytes.len() as u32 - directory_offset;
        let mut eocd = vec![0u8; 22];
        eocd[..4].copy_from_slice(b"PK\x05\x06");
        eocd[8..10].copy_from_slice(&(central_entries.len() as u16).to_le_bytes());
        eocd[10..12].copy_from_slice(&(central_entries.len() as u16).to_le_bytes());
        eocd[12..16].copy_from_slice(&directory_size.to_le_bytes());
        eocd[16..20].copy_from_slice(&directory_offset.to_le_bytes());
        bytes.extend(eocd);
        bytes
    }

    fn minimal_docx() -> Vec<u8> {
        fixture_docx(b"<w:document/>", false, None)
    }

    #[test]
    fn reads_supported_treatment_files_and_normalizes_format() {
        let folder = TestFolder::new();
        let markdown = folder.0.join("outline.MARKDOWN");
        fs::write(&markdown, "# Treatment\n\nStory.").unwrap();

        let result = read_treatment_file(markdown.to_string_lossy().into()).unwrap();
        assert_eq!(result.file_name, "outline.MARKDOWN");
        assert_eq!(result.format, "md");
        assert_eq!(result.contents, b"# Treatment\n\nStory.");
    }

    #[test]
    fn rejects_unsupported_corrupt_and_non_utf8_imports() {
        let folder = TestFolder::new();
        let text = folder.0.join("treatment.txt");
        let docx = folder.0.join("treatment.docx");
        let markdown = folder.0.join("treatment.md");
        fs::write(&text, "text").unwrap();
        fs::write(&docx, b"not a zip").unwrap();
        fs::write(&markdown, [0xff, 0xfe]).unwrap();

        assert!(read_treatment_file(text.to_string_lossy().into()).is_err());
        assert!(read_treatment_file(docx.to_string_lossy().into()).is_err());
        assert!(read_treatment_file(markdown.to_string_lossy().into()).is_err());
    }

    #[test]
    fn writes_valid_content_only_to_matching_extensions() {
        let folder = TestFolder::new();
        let markdown = folder.0.join("treatment.md");
        let docx = folder.0.join("treatment.docx");
        let pdf = folder.0.join("treatment.pdf");

        assert_eq!(
            write_treatment_file(
                markdown.to_string_lossy().into(),
                "md".into(),
                b"# Treatment\n".to_vec(),
            )
            .unwrap(),
            markdown.to_string_lossy()
        );
        write_treatment_file(docx.to_string_lossy().into(), "docx".into(), minimal_docx()).unwrap();
        write_treatment_file(
            pdf.to_string_lossy().into(),
            "pdf".into(),
            b"%PDF-1.7\nfixture\n%%EOF".to_vec(),
        )
        .unwrap();

        assert!(write_treatment_file(
            folder.0.join("wrong.pdf").to_string_lossy().into(),
            "docx".into(),
            minimal_docx(),
        )
        .is_err());
        assert!(write_treatment_file(
            folder.0.join("bad.pdf").to_string_lossy().into(),
            "pdf".into(),
            b"not pdf".to_vec(),
        )
        .is_err());
    }

    #[test]
    fn rejects_docx_archives_with_unsafe_expansion_or_entry_counts() {
        let mut oversized = minimal_docx();
        let eocd = oversized
            .windows(4)
            .rposition(|window| window == b"PK\x05\x06")
            .unwrap();
        let central = read_u32(&oversized, eocd + 16).unwrap() as usize;
        oversized[central + 24..central + 28]
            .copy_from_slice(&(MAX_DOCX_EXPANDED_SIZE as u32 + 1).to_le_bytes());
        assert!(validate_docx(&oversized).is_err());

        let mut crowded = b"PK\x03\x04fixture".to_vec();
        let directory_offset = crowded.len() as u32;
        for index in 0..=MAX_DOCX_ENTRIES {
            let name = if index == 0 {
                "[Content_Types].xml".to_string()
            } else if index == 1 {
                "word/document.xml".to_string()
            } else {
                format!("word/item-{index}.xml")
            };
            let mut entry = vec![0u8; 46];
            entry[..4].copy_from_slice(b"PK\x01\x02");
            entry[28..30].copy_from_slice(&(name.len() as u16).to_le_bytes());
            entry.extend_from_slice(name.as_bytes());
            crowded.extend(entry);
        }
        let directory_size = crowded.len() as u32 - directory_offset;
        let mut eocd = vec![0u8; 22];
        eocd[..4].copy_from_slice(b"PK\x05\x06");
        eocd[8..10].copy_from_slice(&u16::MAX.to_le_bytes());
        eocd[10..12].copy_from_slice(&u16::MAX.to_le_bytes());
        eocd[12..16].copy_from_slice(&directory_size.to_le_bytes());
        eocd[16..20].copy_from_slice(&directory_offset.to_le_bytes());
        crowded.extend(eocd);
        assert!(validate_docx(&crowded).is_err());
    }

    #[test]
    fn rejects_docx_when_declared_expansion_is_smaller_than_deflated_output() {
        assert!(validate_docx(&fixture_docx(
            b"<w:document>Compressed treatment.</w:document>",
            true,
            None,
        ))
        .is_ok());

        let expanded = vec![b'x'; 1024 * 1024];
        let forged = fixture_docx(&expanded, true, Some(1));
        assert!(validate_docx(&forged).is_err());
    }

    #[test]
    fn failed_atomic_export_keeps_the_existing_file() {
        let folder = TestFolder::new();
        let target = folder.0.join("treatment.md");
        fs::write(&target, b"original treatment").unwrap();

        let error = atomic_replace(&target, |file| {
            file.write_all(b"partial replacement")?;
            Err(io::Error::other("simulated interruption"))
        })
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::Other);
        assert_eq!(fs::read(&target).unwrap(), b"original treatment");

        atomic_replace(&target, |file| file.write_all(b"complete replacement")).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"complete replacement");
        assert!(!fs::read_dir(&folder.0).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".scs-treatment-")));
    }
}
