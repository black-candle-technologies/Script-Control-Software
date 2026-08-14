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

Schema version 4 stores project identity/type, timestamps, complete screenplay documents, shared project workspace data, episode documents, and project history. Shared workspace data includes series metadata, collaborators/roles, scoped reviews, approvals, writer-room state, full tab/split/floating layout topology, persistent reference targets, shortcuts, and portable sync configuration. History contains named whole-project, episode, season, or show-bible snapshots, milestones, project-wide Alternate Draft branches, and merge ancestry; each snapshot deliberately excludes its containing history so files cannot grow recursively. It is UTF-8, pretty-printed JSON and may be copied, diffed, or versioned with ordinary tools. Older manifests are migrated on open; malformed documents, collaboration records, layouts, snapshots, duplicate document IDs, and duplicate block IDs are repaired or rejected before the editor renders them.

Machine-local values are not portable source data. Acting identity, the opened/shared absolute path, Companion watch-folder path, each document's linked-FDX absolute path and filesystem timestamp, Git author name/email, and last-sync status are stripped when the manifest or a history snapshot is written. Script provenance and its text fingerprint remain portable; after moving a project, choose the local watch folder once to relink a uniquely matching FDX filename. The path used by **Sync Now** is always the `scs.project.json` that this computer opened, so different cloud-drive mount points cannot redirect another collaborator's save.

## `scripts/`

Every document also writes a Fountain screenplay (`main.fountain` for a feature or numbered episode files for television). These files provide a tool-independent screenplay fallback. The JSON manifest is authoritative and commits first; each Fountain mirror is then replaced through its own synchronized temporary file. A crash in that brief interval can leave a mirror older than the manifest, and the next successful save refreshes it.

## Development folders

`treatments/`, `notes/`, `references/`, and `exports/` are user-owned open-format areas. `.scs/versions/` and `.scs/cache/` are reserved for rebuildable working data; deleting `.scs/cache/` must never destroy source data.

## Compatibility

Readers reject an empty manifest or a schema newer than they understand. Project saves validate the exact `scs.project.json` filename, create only the documented child folders, preserve the original creation timestamp, and compare the exact live manifest again immediately before replacement. The temporary manifest is flushed before the live file moves to a protected `.bak`; open restores a valid backup if the live file is missing or corrupt and preserves rejected live bytes in a timestamped `.corrupt-*` sibling. Fountain mirrors are separate fallback writes, not a whole-folder atomic transaction. A save lock is never evicted merely because it is old; after a crash, remove `.scs/project-save.lock` only after confirming that no other SCS process or computer is saving the project. Structured arrays with stable IDs merge record by record; primitive or malformed arrays remain atomic and require an explicit conflict choice. See [COLLABORATION.md](COLLABORATION.md) for the handoff and recovery workflow.

SQLite is deliberately absent until project size demonstrates that in-memory search is insufficient.
