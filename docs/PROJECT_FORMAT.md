# SCS Project Format

## Phase 1 linked FDX wrapper

Phase 1 writes a portable `scs.project.json` alongside the user-selected FDX
files. It links `sourcePath` values and never copies or moves the source files.
The manifest contains `schemaVersion`, project identity/name/type/timestamps,
and script entries. A television manifest adds `seasonNumber: 1` and sequential
`episodeNumber` values for its linked episodes.

> Status: **active for linked FDX manifests** (Phase 1). Opening existing
> manifests and broader project-folder management remain later work.

An SCS project is an ordinary folder named `MyProject.scs/`. The guiding
principle is **portability**: a writer should never feel that their work is
trapped inside a black-box database, and should always be able to keep using
Final Draft or another FDX-compatible tool alongside SCS.

## Folder layout

```text
MyProject.scs/
  scs.project.json        # Portable project metadata (the source of truth)
  scripts/
    main.fdx              # External, portable FDX script source(s)
  treatments/             # Long-form development documents (Markdown)
  notes/                  # Loose research and notes
  references/             # Images, links, supporting material
  exports/                # Generated breakdowns and JSON / PDF exports
  .scs/                   # Internal working data — safe to delete and rebuild
    database.sqlite       # Planned local index for fast search/indexing
    versions/             # Planned version-history storage
    cache/                # Disposable caches
```

A television project uses the same shape, with episode scripts living under
`scripts/` (for example `scripts/s01e01.fdx`). Show-level material such as the
show bible lives alongside, e.g. `notes/show-bible.md`.

## What each part is for

### `scs.project.json` — portable metadata

This file is the **source of truth** for the project. It is plain, human-readable
JSON: project title, kind (`feature` or `show`), format version, and references
to the script files and documents that make up the project. Because it is JSON,
it can be read, diffed, backed up and version-controlled with ordinary tools.

A `formatVersion` field is included from day one so the format can evolve without
breaking older projects.

### `scripts/*.fdx` — external, portable script sources

Screenplays are kept as **standalone FDX files**, not embedded inside a
proprietary database. This is deliberate:

- A writer can open the same `.fdx` in Final Draft or any FDX-compatible tool.
- SCS can watch and re-import the file if it changes externally (companion mode,
  a later phase).
- SCS-specific metadata (beats, treatments, recognition, versions) is kept
  *separate* from the screenplay file so the FDX stays clean.

### `.scs/database.sqlite` — planned local index

A SQLite database is **planned** to give SCS fast, structured access to the
project: scene lists, character/object/location indexes, search, and breakdown
queries. It is treated as a **rebuildable cache, never the source of truth** —
the JSON metadata and the FDX scripts can always regenerate it. Deleting the
`.scs/` folder must never lose real work.

### `exports/` and JSON portability

Every meaningful structure in SCS should be exportable to JSON (and, where it
makes sense, Markdown / CSV / PDF). This is the anti-lock-in guarantee: a writer
can take their structured story data with them. JSON export is **planned**.

## Portability guarantees

1. **The source of truth is portable.** `scs.project.json` plus the FDX scripts
   fully describe the project in open formats.
2. **The index is disposable.** Anything under `.scs/` can be deleted and rebuilt.
3. **FDX stays external.** SCS never rewrites the screenplay into a format only it
   can read.
4. **Export prevents lock-in.** Structured data can leave SCS as JSON.

These rules keep SCS a *better development layer around files writers already
have*, rather than a cage around their work.
