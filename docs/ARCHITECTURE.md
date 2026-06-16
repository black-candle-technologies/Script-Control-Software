# SCS Architecture

> Status: Phase 0. This describes the intended layering of SCS. Only the
> **frontend shell**, the **command layer** and the **domain model layer** exist
> today; everything below them is named and reserved, not built.

SCS is a local-first desktop application built on **Tauri** (native shell) with a
**React / TypeScript** frontend and a **Rust** backend. The architecture is
organised into layers so that each future capability — parsing, storage,
versioning, recognition — has an obvious home before any of it is written.

## Layer overview

```text
┌─────────────────────────────────────────────────────────────┐
│  Frontend shell        React + TypeScript (src/)             │  active
│    dashboard, panels, typed domain models                    │
├─────────────────────────────────────────────────────────────┤
│  Command layer         Rust #[tauri::command] (src-tauri/)   │  active
│    the bridge between UI and backend                         │
├─────────────────────────────────────────────────────────────┤
│  Domain model layer    Rust + TS, kept in sync               │  active
│    project, hierarchy, entities, versions                    │
├─────────────────────────────────────────────────────────────┤
│  Storage layer         JSON metadata + planned SQLite index  │  planned
├─────────────────────────────────────────────────────────────┤
│  Parser / compiler     FDX → model, model → breakdowns       │  planned
├─────────────────────────────────────────────────────────────┤
│  Versioning layer      Git-style snapshots, branches, diffs  │  planned
├─────────────────────────────────────────────────────────────┤
│  Recognition layer     deterministic entity detection        │  planned
└─────────────────────────────────────────────────────────────┘
```

## Frontend shell — `src/`

A React/TypeScript application rendered inside the Tauri window. In Phase 0 it is
a single dashboard that communicates the product's direction without pretending
features exist. The UI is intentionally **data-driven**: it renders from the
typed domain models in `src/domain/` rather than hard-coding content, so the
foundation stays honest and easy to extend.

- `src/App.tsx` — the shell (top bar + hero).
- `src/components/Dashboard.tsx` — the dashboard sections.
- `src/domain/` — the TypeScript domain models (see DOMAIN_MODELS.md).

## Command layer — `src-tauri/src/lib.rs`

The Rust side exposes `#[tauri::command]` functions that the frontend calls via
`invoke`. Today there is one — `get_app_info` — which returns the application's
identity. This thin layer is where future operations (open project, parse FDX,
query the index, compute a diff) will be surfaced to the UI. The frontend always
degrades gracefully when a command is unavailable (e.g. running outside Tauri).

## Domain model layer — `src-tauri/src/domain.rs` and `src/domain/`

The shared vocabulary of the product, deliberately maintained on **both** sides:

- **Rust** (`src-tauri/src/domain.rs`) — types the backend will own: app
  identity, capability status, project kind.
- **TypeScript** (`src/domain/`) — the richer set the UI consumes: story
  hierarchy, project types, foundation status, workspace panels, plus drafted
  placeholders for television, recognition and versioning.

Both sides use the same `active` / `drafted` / `planned` status vocabulary and
the same serde field names, so the bridge across the command layer is unambiguous.

## Storage layer — *planned*

Portable `scs.project.json` metadata is the source of truth; a SQLite database
under `.scs/` is planned as a rebuildable index for fast queries and search. See
PROJECT_FORMAT.md.

## Parser / compiler layer — *planned*

Two deterministic engines (no AI required):

- **Parser** — read `.fdx` XML into the internal screenplay model.
- **Compiler** — walk the model to generate scene lists, breakdowns and reports.

Both belong in Rust for performance and live behind the command layer.

## Versioning layer — *planned*

Git-style version control with writer-friendly terminology (snapshots, branches,
commits, diffs). Diffs are **screenplay-aware** — they describe scene moves and
dialogue changes, not raw text deltas. Storage is reserved under `.scs/versions/`.
See the versioning model in DOMAIN_MODELS.md.

## Recognition layer — *planned*

A deterministic engine that detects characters, objects/props, locations and
recurring motifs from the screenplay, surfacing each as a **candidate** with a
confidence score and possible merges, always confirmed by the writer. See the
recognition model in DOMAIN_MODELS.md.

## Why layer it now

Phase 0 builds none of the lower layers, but naming them keeps the early code
honest: the command layer stays thin, the domain models stay shared, and there is
an obvious place for each future capability to land without reshaping the app.
