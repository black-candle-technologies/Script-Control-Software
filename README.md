# Script Control Software (SCS)

SCS is a local-first desktop workspace for screenwriting and film/television development. It imports and exports FDX, edits screenplay elements, and keeps story structure, treatments, entities, versions, continuity, production metadata, and reports beside the script in open formats.

## What works

- Tauri 2 + React/TypeScript + Rust desktop app.
- Editable FDX import, clean FDX export, Fountain source/export, and print-to-PDF.
- Screenplay keyboard flow, undo/redo, element switching, completion, smart uppercase, and visible page boundaries.
- Drag-reorderable scenes with act/sequence/scene/beat hierarchy, summaries, tags, status, notes, and Markdown treatments.
- Deterministic character, location, object, production-category, dialogue, pacing, and shooting-complexity analysis.
- Whole-project/episode/season/show-bible snapshots, Alternate Draft branches, milestones, scoped restore, readable semantic comparisons, and previewed per-conflict three-way merges.
- Feature and television projects with episode tabs, shared cast/locations, show bible, season arcs, and continuity notes.
- Revision colors, locked-page records, omitted scenes, draft labels, department notes, and Markdown/CSV/JSON/PDF report output.
- Runtime-composed tab/split/floating workspaces, independently targeted draft/episode/entity/bible/arc/history/timeline references, project-wide search, command palette, and customizable shortcuts.
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
pnpm check
pnpm test:e2e
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

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

- [Workspace layouts, search, and shortcuts](docs/WORKSPACES.md)
- [Collaboration, shared folders, roles, and Git sync](docs/COLLABORATION.md)
- [FDX interoperability and Companion mode](docs/FDX_IMPORT.md)
- [Portable project format](docs/PROJECT_FORMAT.md)
- [Television workflow](docs/TELEVISION.md) and [production workflow](docs/PRODUCTION.md)

See [ROADMAP.md](ROADMAP.md) for product direction and [CONTRIBUTING.md](CONTRIBUTING.md) for development checks.
