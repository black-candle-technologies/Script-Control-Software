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
| Title/author and title-page paragraph attributes | Active |
| Linked-file change detection | Active |
| SCS metadata isolation | Scene notes and private workspace data stay outside FDX; outline beats are the deliberate interoperability exception |
| Final Draft interoperability | Escaped XML export with explicit warnings for unsafe attributes, invalid XML characters, and stale styled runs |

SCS intentionally avoids claiming lossless support for undocumented vendor-specific extensions.
