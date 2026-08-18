# FDX Interoperability

Rust parses local FDX XML into typed blocks, styled text runs, rich title-page paragraphs, scenes, cast, locations, Beat Board data, source metadata, and preservation warnings. Unknown screenplay paragraph types and safe XML attributes remain attached to imported blocks and round-trip through export. Title page, Beat Board, outline, and header/footer paragraphs are scoped separately, so they never appear as screenplay text.

Final Draft Beat cards import into the outline with their stable IDs, titles, bodies, colors, board rectangles, and beat-to-beat flow lines. Final Draft Outline and Summary paragraphs also become outline notes instead of visible screenplay blocks. FDX export writes outline beats back as Beat Board list items and display-board records.

Imported documents are editable. Unchanged styled runs retain style and revision attributes; if edited paragraph text no longer matches its imported runs, `toFdxWithWarnings` reports the plain-text fallback. Invalid XML characters are replaced and unsafe attribute names are omitted with warnings so the result remains valid XML. Private SCS workspace data and scene notes stay outside the FDX payload; outline beats are the deliberate interoperability exception. The linked source is watched; external changes require an explicit re-import that preserves SCS metadata.

Import warnings with a surviving screenplay block index are clickable and focus that block. Warnings about file-level or title-page data remain informational because title paragraphs are intentionally outside the screenplay editor block list.

## Rich title pages

The title-page model has two layers:

- Canonical editable fields: Title, Credit, Author, Source, Draft Date, Contact, Copyright, and Notes.
- The complete ordered FDX paragraph list, including duplicate canonical fields, custom/vendor or untyped fields, empty placeholders, multiple `Text` runs, bold/italic/underline/strikeout and revision data, and safe paragraph/run attributes such as positioning or alignment metadata.

Import projects the first useful recognized paragraph into each canonical field without deleting or reordering the underlying list. The title-page editor exposes the canonical fields and an expandable **Imported and custom paragraphs** list. Custom rows may be added, reordered, edited, or removed; read-only documents expose the data without mutation.

FDX export retains paragraph order and safe attributes. The canonical editor value updates the selected representative paragraph for that field; duplicate/custom paragraphs remain independent. A styled run is reused only while the concatenated run text still matches the paragraph text. If it is stale, SCS exports safe plain text and reports the exact fallback instead of emitting mismatched style boundaries. A filename used as the document's display-title fallback is not invented as imported title-page content.

Fountain has a smaller title-page vocabulary. SCS writes one value per canonical field in canonical order and supports indented continuation lines, but Fountain cannot encode imported paragraph order, duplicate fields, custom/untyped fields, empty placeholders, FDX positioning/vendor attributes, or character-run styling. `toFountainWithWarnings` lists each applicable limitation. Those opaque details remain in the project and FDX model; they are omitted only from the Fountain text. If a real Fountain Source edit changes styled or positioned title text, SCS retains the imported metadata but warns that stale run styling will be dropped on FDX export. Merely switching into and out of Fountain Source without editing does not reparse or discard the rich data.

## Linked-file and companion workflow

Choose the **Companion** workspace to use SCS beside Final Draft or another application registered for `.fdx` files. Choose a watch folder, optionally include subfolders, and link any discovered screenplay. SCS scans that explicit folder every five seconds without following symbolic links. It never rewrites a watched FDX automatically.

Each import records the source file's modified timestamp. That baseline is stored in the portable project, so an external change is still detected after SCS restarts. **Open Externally** uses the operating system's default `.fdx` application; **Reveal FDX** opens its location in the file manager.

On re-import, SCS reuses matching block and scene identities and preserves project-owned data: boards, treatments, entity decisions and notes, revision sets, production metadata, version history, show references, and continuity. If only the external FDX changed, the user can re-import directly. If both SCS script text and the FDX changed, SCS presents two explicit choices:

- **Use external FDX** first creates a protected SCS draft version, then imports the external script text.
- **Keep SCS draft** creates a protected version and acknowledges the current external timestamp without replacing SCS text.

Portable projects retain the last imported screenplay fingerprint while omitting machine-local paths. When a matching watch-folder file is selected again, SCS compares the retained baseline with both copies before relinking: local-only edits remain untouched, external-only edits can be imported, and two-sided edits enter the conflict workflow. Actual Fountain edits preserve the external baseline and retain opaque imported metadata on matching screenplay and title-page paragraphs where it is still valid.

Exports remain deliberate. After reconciling changes, export a new FDX when it is time to hand the SCS draft back to the external editor.

Watch-folder access is local and user-authorized. Missing or unreadable folders report an error; non-FDX files and symbolic links are ignored. A shared Dropbox, OneDrive, or network folder can be watched, but SCS does not provide provider identity or locking at the FDX layer.

Fixture coverage lives under `src-tauri/test-fixtures/` and includes malformed XML, styled text, scene numbers, unknown types, character extensions, unusual headings, multiple television episodes, and the realistic synthetic `title-page-rich.fdx` with ordered duplicates, empty/custom/untyped paragraphs, styled runs, multiline contact text, and vendor attributes.
