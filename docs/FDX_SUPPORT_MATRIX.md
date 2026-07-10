# FDX support matrix

| Area | Phase 1 status |
| --- | --- |
| XML parsing | Supported in Rust with `quick-xml` |
| Title and author title-page paragraphs | Supported when present |
| Scene Heading, Action, Character, Dialogue, Parenthetical, Transition, Shot, General | Supported |
| Lyrics, Cast List, New Act, End of Act | Parsed and displayed as normalized blocks |
| Unknown paragraph types | Preserved with original type/attributes and a warning |
| Text-run order and bold/italic/underline/strikeout metadata | Parsed; inline typography is preserved in data but not yet rendered separately |
| Paragraph IDs, attributes, scene numbers, revision IDs, document version | Preserved for future export |
| Scene, character, location extraction | Supported with conservative best-effort parsing |
| Page breaks and advanced revisions | Parsed only when represented in attributes; not displayed |
| Dual dialogue, pagination, headers/footers, complete title-page layout | Not yet tested or displayed |
| FDX export and round-trip fidelity | Unsupported in Phase 1 |
