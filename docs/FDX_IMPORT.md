# FDX Interoperability

Rust parses local FDX XML into typed blocks, styled text runs, scenes, cast, locations, Beat Board data, source metadata, and preservation warnings. Unknown screenplay paragraph types and safe XML attributes remain attached to imported blocks and round-trip through export. Beat Board and header/footer paragraphs are scoped separately, so they never appear as screenplay text.

Final Draft Beat cards import into the outline with their stable IDs, titles, bodies, colors, board rectangles, and beat-to-beat flow lines. Final Draft Outline and Summary paragraphs also become outline notes instead of visible screenplay blocks. FDX export writes outline beats back as Beat Board list items and display-board records.

Imported documents are editable. Unchanged styled runs retain style and revision attributes; if edited paragraph text no longer matches its imported runs, `toFdxWithWarnings` reports the plain-text fallback. Invalid XML characters are replaced and unsafe attribute names are omitted with warnings so the result remains valid XML. Private SCS workspace data and scene notes stay outside the FDX payload; outline beats are the deliberate interoperability exception. The linked source is watched; external changes require an explicit re-import that preserves SCS metadata.

Import warnings with a source paragraph are clickable and focus the affected screenplay block.

## Linked-file and companion workflow

Choose the **Companion** workspace to use SCS beside Final Draft or another application registered for `.fdx` files. Choose a watch folder, optionally include subfolders, and link any discovered screenplay. SCS scans that explicit folder every five seconds without following symbolic links. It never rewrites a watched FDX automatically.

Each import records the source file's modified timestamp. That baseline is stored in the portable project, so an external change is still detected after SCS restarts. **Open Externally** uses the operating system's default `.fdx` application; **Reveal FDX** opens its location in the file manager.

On re-import, SCS reuses matching block and scene identities and preserves project-owned data: boards, treatments, entity decisions and notes, revision sets, production metadata, version history, show references, and continuity. If only the external FDX changed, the user can re-import directly. If both SCS script text and the FDX changed, SCS presents two explicit choices:

- **Use external FDX** first creates a protected SCS draft version, then imports the external script text.
- **Keep SCS draft** creates a protected version and acknowledges the current external timestamp without replacing SCS text.

Portable projects retain the last imported screenplay fingerprint while omitting machine-local paths. When a matching watch-folder file is selected again, SCS compares the retained baseline with both copies before relinking: local-only edits remain untouched, external-only edits can be imported, and two-sided edits enter the conflict workflow. Switching an imported document through Fountain Source without editing it does not re-parse the screenplay, so FDX runs, paragraph attributes, scene numbers, and extended title-page data remain intact. Actual Fountain edits preserve the external baseline and retain opaque imported metadata on matching paragraphs where it is still valid.

Exports remain deliberate. After reconciling changes, export a new FDX when it is time to hand the SCS draft back to the external editor.

Watch-folder access is local and user-authorized. Missing or unreadable folders report an error; non-FDX files and symbolic links are ignored. A shared Dropbox, OneDrive, or network folder can be watched, but SCS does not provide provider identity or locking at the FDX layer.

Fixture coverage lives under `src-tauri/test-fixtures/` and includes malformed XML, styled text, scene numbers, unknown types, character extensions, unusual headings, and multiple television episodes.
