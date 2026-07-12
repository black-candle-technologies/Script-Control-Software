# FDX Interoperability

Rust parses local FDX XML into typed blocks, styled text runs, scenes, cast, locations, source metadata, and preservation warnings. Unknown paragraph types and attributes remain attached to imported blocks.

Imported documents are editable. SCS keeps its development metadata outside the FDX payload and exports clean screenplay paragraphs. The linked source is watched; external changes require an explicit re-import that preserves SCS metadata.

Fixture coverage lives under `src-tauri/test-fixtures/` and includes malformed XML, styled text, scene numbers, unknown types, character extensions, unusual headings, and multiple television episodes.
