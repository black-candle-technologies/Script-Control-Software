# SCS Project Format

An SCS project is a normal folder whose portable source of truth is JSON plus open screenplay/document formats.

```text
MyProject.scs/
  scs.project.json
  scripts/
    main.fountain
    episode-2.fountain
  treatments/
  notes/
  references/
  exports/
  .scs/
    versions/
    cache/
```

## `scs.project.json`

Schema version 4 stores project identity/type, timestamps, complete screenplay documents, shared project workspace data, and project history. Each document includes canonical title-page fields plus any ordered rich FDX title paragraphs, screenplay blocks, story/development metadata, and portable source provenance. Shared workspace data includes series metadata, collaborators/roles, scoped reviews, approvals, writer-room state, portable saved layouts, persistent reference targets, shortcuts, and portable sync configuration. History contains named whole-project, episode, season, or show-bible snapshots, milestones, project-wide Alternate Draft branches, and merge ancestry; each snapshot deliberately excludes its containing history so files cannot grow recursively. It is UTF-8, pretty-printed JSON and may be copied, diffed, or versioned with ordinary tools. Older manifests are migrated on open; malformed documents, collaboration records, layouts, snapshots, duplicate document IDs, and duplicate block IDs are repaired or rejected before the editor renders them.

Machine-local values are not portable source data. Acting identity, the opened/shared absolute path, Companion watch-folder path, each document's linked-FDX absolute path and filesystem timestamp, Git author name/email, and last-sync status are stripped when the manifest or a history snapshot is written. Open/active tabs, editor scroll/source selection, per-window active mode/layout, selected board scene/beat, Write-tree collapse state, and Breakdown disclosure state also stay outside the manifest and persist in local preferences. The active dock panel, native geometry, and monitor placement are live-only today: they stay outside the manifest but are not yet captured for restart restoration. Script provenance and its text fingerprint remain portable; after moving a project, choose the local watch folder once to relink a uniquely matching FDX filename. The path used by **Sync Now** is always the `scs.project.json` that this computer opened, so different cloud-drive mount points cannot redirect another collaborator's save.

## Portable layout records

The six built-in presets remain protected legacy `SavedLayout` records and are expanded into registered panels at runtime. A saved custom layout uses `layoutVersion: 2` and contains:

- portable identity and the legacy placement fields needed by older readers;
- validated panel definitions (data and `kind`, never React components);
- one nested `root` of `tabs` and `split` nodes;
- positive split `sizes` that total 1 at each node;
- normalized logical floating rectangles (`x`, `y`, `width`, `height` as workspace fractions);
- `hiddenPanelIds` and validated synchronized-panel groups.

Every visible, floating, or hidden panel has exactly one owner. Node/panel IDs must be unique, cycles are rejected, required panels cannot be hidden, and floating bounds are normalized. Legacy custom layouts with flat `tabGroups` and `splits` migrate into the version-2 tree on open. Malformed or hostile topology falls back to a usable Writer-centered layout; it does not execute serialized UI or preserve unsafe monitor coordinates. Built-ins cannot be overwritten, renamed, or deleted. Deleting a custom layout removes only its `layout:<id>` shortcut and repairs a legacy portable active ID to `writer` when necessary.

`workspace.activeLayoutId` remains the portable backward-compatible default. Saving/updating a custom layout deliberately preserves it. The active layout for each live native window is stored in device-local UI preferences, so applying a layout in one window does not hijack the other windows.

## Device-local preferences and emergency recovery

Browser/WebView storage uses two independently normalized models:

- `scs.ui.v2` is a schema-versioned preference record. It migrates the former flat `scs.ui.v1` chrome values and stores project/window-scoped tabs, editor views (including Fountain selection), active mode/layout, selected story items, collapsed tree nodes, and project/document-scoped Breakdown disclosure state. Its normalizer accepts bounded optional active-panel and geometry fields, but the current workspace does not write those fields. Unknown versions or malformed data fall back to bounded defaults.
- Emergency sessions are stored per project under `scs.project-session.v4:<encoded-project-id>`, with `scs.project-session.v4.current-project` identifying the most recent recovery. The former global `scs.project-session.v3` slot and the older `scs.document.v1`/`scs.versions.v1` pair migrate one way into the project-scoped record. Invalid JSON is ignored safely.

These local records are crash recovery and view preferences, not the durable portable save and not a cross-window authority. In a native multi-window run, the Rust coordinator owns accepted revisions and serializes recovery/portable save intents through the leader. Coordinator revisions, action IDs, drag previews, and other live protocol state are transient and never written into `scs.project.json`.

## `scripts/`

Every document also writes a Fountain screenplay (`main.fountain` for a feature or numbered episode files for television). These files provide a tool-independent screenplay fallback. The JSON manifest is authoritative and commits first; each Fountain mirror is then replaced through its own synchronized temporary file. A crash in that brief interval can leave a mirror older than the manifest, and the next successful save refreshes it.

## Development folders

`treatments/`, `notes/`, `references/`, and `exports/` are user-owned open-format areas. `.scs/versions/` and `.scs/cache/` are reserved for rebuildable working data; deleting `.scs/cache/` must never destroy source data.

## Compatibility

Readers reject an empty manifest or a schema newer than they understand. Project saves validate the exact `scs.project.json` filename, create only the documented child folders, preserve the original creation timestamp, and compare the exact live manifest again immediately before replacement. The temporary manifest is flushed before the live file moves to a protected `.bak`; open restores a valid backup if the live file is missing or corrupt and preserves rejected live bytes in a timestamped `.corrupt-*` sibling. Fountain mirrors are separate fallback writes, not a whole-folder atomic transaction. A save lock is never evicted merely because it is old; after a crash, remove `.scs/project-save.lock` only after confirming that no other SCS process or computer is saving the project. Structured arrays with stable IDs merge record by record; primitive or malformed arrays remain atomic and require an explicit conflict choice. See [COLLABORATION.md](COLLABORATION.md) for the handoff and recovery workflow.

SQLite is deliberately absent until project size demonstrates that in-memory search is insufficient.
