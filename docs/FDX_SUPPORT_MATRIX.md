# FDX Support Matrix

| Area | Status |
|---|---|
| Common screenplay paragraphs | Import/edit/export |
| Styled text and revision IDs | Imported and round-tripped while runs still match paragraph text; edited mismatches export as plain text with a warning |
| SCS colored revision marks | Changed blocks receive matching text runs and `RevisionID` attributes before FDX export; revision-set names/colors remain portable SCS metadata because vendor revision-table extensions are undocumented |
| Scene numbers and paragraph attributes | Safe XML attributes are imported and round-tripped |
| Unknown paragraph types | Original type and safe attributes are preserved with an import warning |
| Beat Board and outline notes | Beat titles, bodies, colors, card rectangles, canvas settings, and beat-to-beat flow lines import into the SCS outline and export as Final Draft Beat Board data |
| Scene/cast/location derivation | Active |
| Canonical title-page fields | Title, Credit, Author, Source, Draft Date, Contact, Copyright, and Notes import, edit, normalize, and export |
| Rich FDX title-page paragraphs | Ordered duplicate, custom/untyped, multiline, and empty paragraphs are retained with their safe paragraph attributes and multiple styled/revision text runs |
| Edited title-page styling | Matching runs round-trip; if edited text no longer matches imported runs, safe plain text exports with an explicit stale-style warning |
| Fountain title pages | One canonical value per supported field with multiline continuations; original order, duplicates, custom/untyped or empty paragraphs, FDX positioning/vendor attributes, and styled runs stay in project/FDX data but cannot be represented in Fountain and produce conversion warnings |
| Linked-file change detection | Active |
| SCS metadata isolation | Scene notes and private workspace data stay outside FDX; outline beats are the deliberate interoperability exception |
| Final Draft interoperability | Escaped XML export with explicit warnings for unsafe attributes, invalid XML characters, and stale screenplay/title-page styled runs |

SCS intentionally avoids claiming lossless support for undocumented vendor-specific extensions.
