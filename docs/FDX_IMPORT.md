# FDX Interoperability

Rust parses local FDX XML into typed blocks, styled text runs, scenes, cast, locations, source metadata, and preservation warnings. Unknown paragraph types and safe XML attributes remain attached to imported blocks and round-trip through export.

Imported documents are editable. Unchanged styled runs retain style and revision attributes; if edited paragraph text no longer matches its imported runs, `toFdxWithWarnings` reports the plain-text fallback. Invalid XML characters are replaced and unsafe attribute names are omitted with warnings so the result remains valid XML. SCS workspace data and scene notes stay outside the FDX payload. The linked source is watched; external changes require an explicit re-import that preserves SCS metadata.

Fixture coverage lives under `src-tauri/test-fixtures/` and includes malformed XML, styled text, scene numbers, unknown types, character extensions, unusual headings, and multiple television episodes.
