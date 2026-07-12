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

Schema version 2 stores project identity/type, timestamps, complete screenplay documents, development workspace metadata, episode documents, and draft snapshots. It is UTF-8, pretty-printed JSON and may be copied, diffed, or versioned with ordinary tools.

## `scripts/`

Every document also writes a Fountain screenplay (`main.fountain` for a feature or numbered episode files for television). These files provide a tool-independent screenplay fallback.

## Development folders

`treatments/`, `notes/`, `references/`, and `exports/` are user-owned open-format areas. `.scs/versions/` and `.scs/cache/` are reserved for rebuildable working data; deleting `.scs/cache/` must never destroy source data.

## Compatibility

Readers reject an empty manifest or a schema newer than they understand. Project saves validate the exact `scs.project.json` filename, create only the documented child folders, and preserve the original creation timestamp on later saves.

SQLite is deliberately absent until project size demonstrates that in-memory search is insufficient.
