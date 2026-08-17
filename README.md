# Script Control Software (SCS)

SCS is a local-first desktop workspace for screenwriting and film/television development. It imports and exports FDX, edits screenplay elements, and keeps story structure, treatments, entities, versions, continuity, production metadata, and reports beside the script in open formats.

## What works

- Tauri 2 + React/TypeScript + Rust desktop app.
- Editable FDX import, clean FDX export, Fountain source/export, print-to-PDF, and rich title pages that retain ordered, duplicate, custom, styled, and positioned FDX paragraphs where the target format permits.
- Screenplay keyboard flow, undo/redo, element switching, completion, smart uppercase, and visible page boundaries.
- Drag-reorderable scenes with precise before/after/empty/unassigned previews, keyboard move commands, an accessible Act/Sequence/Scene/Beat tree, selected-scene beat creation, inline beat editing, summaries, tags, status, notes, and Markdown treatments. Outline moves do not rewrite the screenplay until **Make Draft Match Outline** is chosen.
- Deterministic character, location, object, production-category, dialogue, pacing, and shooting-complexity analysis.
- Whole-project/episode/season/show-bible snapshots, Alternate Draft branches, milestones, scoped restore, readable semantic comparisons, and previewed per-conflict three-way merges.
- Feature and television projects with episode tabs, shared cast/locations, show bible, season arcs, and continuity notes.
- Revision colors, locked-page records, omitted scenes, draft labels, department notes, and Markdown/CSV/JSON/PDF report output.
- A mode-based shell (Write, Outline, Treatment, Reference, Series, Breakdown, Drafts, Team, Companion) with generic screenplay tabs, a hierarchical scene navigator, contextual inspector, focus mode, targeted draft/episode/entity/bible/arc/history/timeline references, project-wide search, command palette, and customizable shortcuts.
- Collapsible Breakdown reports with per-project/document device-local disclosure state, plus exact object, character, location, production, warning, and search links that activate the correct screenplay and highlight the intended occurrence without changing script text or undo history.
- Built-in mode presets plus validated custom nested dock layouts, hidden/floating panel recovery, a Window/Layout manager, and native Tauri workspace windows coordinated through one revisioned project session. Logical saved layouts are portable; open tabs, active mode/layout, and editor selections persist locally, while physical window placement is currently live native state rather than restart-restored project data.
- A single font-independent SVG `BrandMark` is shared by the launcher, loading state, title bar, and public icon asset; redundant marks are decorative while product names remain accessible.
- Linked-FDX watch folders, external-editor handoff, two-sided change detection, metadata-preserving re-import, and Companion mode.
- Nine collaboration roles, scoped comments/suggestions, version approvals, writer-room tasks, provider-folder sync, per-conflict merge choices, and optional safe HTTPS Git sync.
- Portable `.scs` folders with crash-recoverable, stale-write-protected manifests, open screenplay fallbacks, and machine-local recovery.

## Run locally

Prerequisites: Node 22+, pnpm 10, Rust stable, and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev
```

Verification:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

For a release, also attempt `pnpm tauri build --debug` and perform the native multi-window checklist in [docs/TESTING.md](docs/TESTING.md). Chromium tests and Rust unit tests do not by themselves prove OS windows, native capabilities, file dialogs, monitor placement, or external-editor handoff.

## Portable project format

```text
MyProject.scs/
  scs.project.json
  scripts/*.fountain
  treatments/
  notes/
  references/
  exports/
  .scs/versions/
  .scs/cache/
```

`scs.project.json` and `scripts/` are portable source data. `.scs/` is rebuildable working data. See [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md).

## Design constraints

- Local-first: no account or server is required.
- Deterministic core: recognition and reports do not require AI.
- Interoperable: screenplay text remains available as FDX/Fountain.
- Writer-controlled: entity candidates, revisions, comments, and assistant use stay opt-in.

## Guides

- [Interface design](docs/UI_DESIGN.md) and [keyboard shortcuts](docs/KEYBOARD_SHORTCUTS.md)
- [Workspaces, search, and shortcuts](docs/WORKSPACES.md)
- [Collaboration, shared folders, roles, and Git sync](docs/COLLABORATION.md)
- [FDX interoperability and Companion mode](docs/FDX_IMPORT.md)
- [Portable project format](docs/PROJECT_FORMAT.md)
- [Television workflow](docs/TELEVISION.md) and [production workflow](docs/PRODUCTION.md)

See [ROADMAP.md](ROADMAP.md) for product direction and [CONTRIBUTING.md](CONTRIBUTING.md) for development checks.
