# SCS Domain Models

> Status: **drafted** (Phase 0). These are the *shapes* of the product. They
> carry no behaviour yet; they exist so the UI, the docs and the Rust layer agree
> on the architecture before any feature is built.

The TypeScript models live in [`src/domain/`](../src/domain) and are re-exported
from `src/domain/index.ts`. The Rust counterparts live in
[`src-tauri/src/domain.rs`](../src-tauri/src/domain.rs). Both sides share one
status vocabulary: `active`, `drafted`, `planned`.

## Story hierarchy

File: `src/domain/hierarchy.ts`.

A core differentiator of SCS is that story structure is **hierarchical**, not a
flat board of interchangeable cards. The four core levels are kept deliberately
distinct:

| Level        | What it holds                                                        |
|--------------|----------------------------------------------------------------------|
| **Act**      | A major dramatic movement — the broadest structural unit.            |
| **Sequence** | A run of scenes bound by a single tension, goal or location.         |
| **Scene**    | A continuous unit of action in one place and time.                   |
| **Beat**     | The smallest deliberate story moment inside a scene.                 |

```text
Feature:  Project → Act → Sequence → Scene → Beat
TV:       Show → Season → Episode → Act → Sequence → Scene → Beat
```

This lets a writer develop top-down (acts → sequences → scenes → beats) or
bottom-up (organise a messy beat board into scenes, sequences and acts). Keeping
the levels separate is what makes SCS a story-architecture tool rather than a
formatter with sticky notes.

## Project types and format

Files: `src/domain/projectTypes.ts`, `src/domain/project.ts`.

Two project kinds — **Feature Film** and **Television Show** — each bound to the
appropriate hierarchy. The on-disk shape (`scs.project.json`, external FDX
scripts, the rebuildable `.scs/` index) is specified in
[PROJECT_FORMAT.md](./PROJECT_FORMAT.md).

## Television

File: `src/domain/television.ts`.

Television is first-class, not bolted on. The drafted model includes:

- **Show → Season → Episode** containers.
- **Episode tabs** — open episodes presented as switchable tabs.
- **Show bible** — the shared, show-level reference document (placeholder).
- **Continuity notes** — references that span multiple episodes (placeholder).
- **Recurring characters** and **recurring objects/props** — entities tracked
  across episodes and seasons.
- **Season arcs** — A/B/C stories and season-long threads tracked across episodes.

No television behaviour is implemented; these are shapes only.

## Recognition

File: `src/domain/recognition.ts`.

A future deterministic engine (no AI) will detect entities moving through the
script. Everything is a **candidate** until the writer confirms it:

- Entity kinds: **characters**, **objects/props**, **locations**, **recurring
  motifs**.
- **Recognition confidence** — a 0–1 score on every candidate, so detections can
  be triaged.
- **Merge candidates** — suggestions that two entities are the same, each with a
  reason and confidence.
- **User confirmation workflow** — `detected → confirmed | rejected | merged`.
  The writer is always in control; nothing is auto-applied.

No recognition logic is implemented; these are shapes only.

## Versioning

File: `src/domain/versioning.ts`.

Git-style version control with writer-friendly terminology. The drafted model
leaves room for:

- **Snapshots** — point-in-time captures of the whole project.
- **Branches** — named lines of development ("alternate drafts").
- **Commits** — saved draft versions, with parents and a message.
- **Diffs** — comparisons between two commits.
- **Scene-aware change summaries** — human-readable, structure-aware descriptions
  such as *"Scene 14 moved from Sequence 3 to Sequence 2."*
- **Project history** — the full set of commits, branches and snapshots.

Writer-facing vocabulary: Commit → Save Draft Version, Branch → Alternate Draft,
Merge → Combine Drafts, Diff → Compare Drafts, Tag → Milestone. No Git behaviour
is implemented; these are shapes only.

## Foundation status and workspace panels

Files: `src/domain/foundation.ts`, `src/domain/panels.ts`, `src/domain/status.ts`.

These drive the dashboard. `foundationSignals` is the single source of truth for
"what is real today" (the runtime stack is `active`, models and format are
`drafted`, storage is `planned`). `workspacePanels` lists the eight planned
panels — Screenplay, Beat Board, Treatment, Characters, Objects/Props, Locations,
Versions, Breakdowns — as honest placeholders.
