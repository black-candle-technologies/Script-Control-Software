# Script Control Software (SCS)

SCS is a local-first desktop workspace for screenwriting and film/television development. It imports and exports FDX, edits screenplay elements, and keeps story structure, treatments, entities, versions, continuity, production metadata, and reports beside the script in open formats.

## What works

- Tauri 2 + React/TypeScript + Rust desktop app.
- Editable FDX import, clean FDX export, Fountain source/export, and print-to-PDF.
- Screenplay keyboard flow, undo/redo, element switching, completion, smart uppercase, and visible page boundaries.
- Drag-reorderable scenes with act/sequence/scene/beat hierarchy, summaries, tags, status, notes, and Markdown treatments.
- Deterministic character, location, object, production-category, dialogue, pacing, and shooting-complexity analysis.
- Persistent draft snapshots, restore, milestones, and scene-aware comparisons.
- Feature and television projects with episode tabs, shared cast/locations, show bible, season arcs, and continuity notes.
- Revision colors, locked-page records, omitted scenes, draft labels, department notes, and Markdown/CSV/JSON/PDF report output.
- Saved workspace presets, project-wide search, command palette, review comments, and opt-in assistant prompts that send no data.
- Portable `.scs` folders and linked-FDX change detection with metadata-preserving re-import.

## Run locally

Prerequisites: Node 22+, pnpm 10, Rust stable, and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev
```

Verification:

```sh
pnpm check
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

See [ROADMAP.md](ROADMAP.md) for product direction and [CONTRIBUTING.md](CONTRIBUTING.md) for development checks.
