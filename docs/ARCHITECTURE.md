# Architecture

SCS is a Tauri 2 application with a React/TypeScript workspace and Rust commands for native authority, files, and parsing.

```text
React workspace
  mode presets · document tabs · panel registry/dock renderer · ScriptTarget navigation
        │ validated Tauri commands and targeted events
Rust backend
  session coordinator · window/drag registry · FDX parser · recoverable project I/O
        │
Open local data
  scs.project.json · Fountain/FDX · reports · provider folders · HTTPS Git
```

## Durable project state

One versioned `ProjectSession` is the durable runtime unit: all screenplay documents, shared series/collaboration/layout data, and history move and persist together. Screenplay block arrays are the source for derived scenes, characters, locations, objects, and reports; board order remains outline state until the writer explicitly chooses **Make Draft Match Outline**.

The principal pure domains are:

- `analysis.ts` for deterministic recognition, exact object-occurrence provenance, and reports.
- `story.ts`, `storyNavigation.ts`, and `storyPlacement.ts` for the Act → Sequence → Scene → Beat hierarchy, board selection, new-beat targets, and preview/commit placement rules.
- `scriptTarget.ts` for typed, transient script navigation.
- `documentTabs.ts` for window-local screenplay views and separately confirmed project-document removal.
- `workspaceLayouts.ts` and `dockTree.ts` for built-in presets, version-2 nested docking, logical floating frames, validation, migration, and recovery.
- `versioning.ts` for project/episode/season/show-bible snapshots, comparisons, project-wide branches, and three-way merge ancestry.
- `collaboration.ts` for role permissions and review, approval, and writer-room transitions.

`src-tauri/src/project_file.rs` validates portable data, replaces the authoritative JSON manifest through a synchronized temporary file, and recovers its protected backup after an interrupted replacement. Fountain files are secondary mirrors refreshed after that manifest commit, so the folder is not presented as one multi-file atomic transaction. `external_files.rs` confines Companion handoff and watch-folder reads, and `git_sync.rs` confines writer-facing Git operations. Browser storage is emergency recovery, not the portable authority.

## Native windows and session authority

Every native project window joins one project/session namespace. The Rust `SessionCoordinatorState` owns the authoritative revision. A durable mutation envelope carries protocol version, project and session IDs, registered origin window ID, actor ID, unique action ID, base revision, timestamp, and a typed mutation. The coordinator binds the origin to its registered window and the actor to the authoritative current collaborator, validates that role, applies an action only once, increments the revision, and emits the accepted mutation to the other registered project windows. Revision listeners are installed before bootstrap snapshots; buffered catch-up and full-snapshot refresh close the subscribe/snapshot and revision-gap races.

Conflict keys are granular where the model permits it. Stale edits to different documents or blocks can be reconciled; competing stale edits to the same resource are rejected. Whole-workspace writes cannot erase newer granular layout changes. Automated TypeScript and Rust tests cover duplicate action IDs, stale/future/history-gap handling, same- and different-resource edits, block fingerprints, permissions, snapshot recovery, and save ordering.

Recovery and portable saves share one serialized coordinator queue. The project leader is the persistence writer; the Window menu identifies it. A save drains pending mutations, captures the exact authoritative revision/session pair, and writes only that pair; completion merges granular project-path/timestamp metadata into the newest live session, never an older saved screenplay snapshot. Closing a secondary window only unregisters that view. Closing the leader while other windows remain promotes the oldest surviving registered window deterministically and abandons/retries any owned save work. Closing the final project window requires explicit confirmation and a successful recovery write (or a second explicit override), so merely closing the original `main` window is not treated as application authority.

Native labels are generated as validated collision-resistant `scs-workspace-*` identifiers rather than from screenplay titles. The main window receives the default core/opener/dialog capability. Matching secondary workspace windows receive the smaller event-listen/unlisten and dialog capability in `src-tauri/capabilities/workspace-windows.json`. Tauri's OS file-drop interception remains disabled (`dragDropEnabled: false`) so the HTML visual-board drag flow continues to work.

## Portable layouts and device-local views

The separation is intentional:

| Portable project data | Device/window-local data |
|---|---|
| Screenplays, title pages, story structure, treatments, entity decisions, reviews, history | Open/active document tabs and per-document editor view |
| Logical custom layouts, panel definitions, dock tree, normalized floating rectangles, layout shortcuts | Persisted per-window active mode/layout, selected scene/beat, collapsed Write-tree nodes |
| Series, collaboration, production, and sync configuration safe to share | Persisted scroll/source selection and Breakdown disclosure; live-only active panel, native geometry/monitor placement, and transient script highlights |

Custom layouts persist a `layoutVersion: 2` tree of `tabs` and nested `split` nodes. Panel ownership must be unique; node IDs, ratios, hidden panels, floats, and synchronization groups are validated. Old flat `tabGroups`/`splits` layouts migrate on normalization. Cycles, duplicate ownership, missing panels, malformed ratios, and invalid geometry fall back to a usable Writer-centered layout. Floating rectangles use logical 0–1 workspace fractions; monitor coordinates never enter a portable layout. Built-in layouts remain protected flat presets and are projected into the runtime tree when applied.

`scs.ui.v2` holds normalized project/window preferences. The portable `workspace.activeLayoutId` remains a backward-compatible default only; saving or updating a custom layout does not switch every window. Each window records its own active layout and per-document view, including Fountain selection. The current active dock panel is not yet written by the workspace. The native manager clamps supplied geometry to connected monitors and minimum sizes and tracks moves/resizes in its live registry, but the workspace does not copy that geometry into restart-restored preferences. **Reset Window Placement** provides recovery; automatic recreation of a prior multi-window set is not assumed by the project format.

## Panels, tabs, and acknowledged transfers

The panel registry maps validated `WorkspacePanelDefinition.kind` values to React renderers; serialized projects never contain components. `DockLayoutRenderer` recursively renders tab and split nodes and supplies pointer and keyboard resizing/movement. `DocumentTabs` is project-type agnostic: closing a tab closes only that window's view, while **Remove from project…** is a permission-checked durable operation with dependency cleanup and a protected recovery snapshot.

The cross-window transfer protocol stores only validated document/panel identifiers and display metadata. Source and destination view revisions are checked, both windows can receive a preview event, and the source is removed only after the destination acknowledges the exact drag ID and placement. Stale views, missing items, invalid targets, unsupported copies, cancellation, and either window closing leave the source intact. The clipboard and filesystem are not used as transport. Window-menu **Move screenplay** and **Move/Copy panel** commands are the non-drag path. Browser Playwright cannot prove the OS event/capability boundary; see [TESTING.md](TESTING.md) for the native checklist.

## Exact script navigation

`ScriptTarget` identifies a document, stable block, optional scene, exact start/end offsets, matched text, and zero-based occurrence. Object continuity, character-dialogue, location-appearance, production-evidence, import-warning, and project-search actions first activate that document and Write mode, then the editor selects and highlights the intended range without changing screenplay text, revisions, or undo history. A stale range may relocate only within its original block. Otherwise navigation falls back to that block, then its original scene, with an accessible status message; it never searches globally for a coincidental match. The transient selection clears on edit, undo/redo, document or subsequent navigation, Escape, or the timeout.

## FDX and title pages

The Rust parser separates screenplay, title-page, header/footer, outline, and Beat Board paragraphs. Rich title pages keep canonical projections (Title, Credit, Author, Source, Draft Date, Contact, Copyright, Notes) plus their complete ordered paragraphs, duplicates, custom/untyped fields, empty placeholders, text runs, revision/style metadata, and safe paragraph attributes. FDX export reuses valid runs and attributes and warns before plain-text or attribute omission. Fountain carries one canonical value per supported field and cannot encode every FDX order, duplicate, custom field, position, vendor attribute, or styled run; those details remain in the project/FDX model and explicit conversion warnings describe the loss.

## Permissions and external boundaries

Read-only roles may navigate documents, references, windows, and reports, but durable project mutations still pass the existing `edit` permission check in both the TypeScript and Rust coordinator paths. Removing a document, editing a beat, applying outline changes, saving portable custom layouts, or changing screenplay content does not gain a bypass merely because it originates in a secondary window or context menu.

Portable serialization also removes acting identity, absolute project/watch/linked-FDX paths, linked-file timestamps, Git author preferences, and last-sync state. Snapshot sessions are sanitized for the same reason. No hosted service is required; collaboration uses portable projects plus optional Git/shared-drive sync, and assistance exports an opt-in prompt without transmitting data.
