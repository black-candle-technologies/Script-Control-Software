# Domain Models

- `screenplay.ts`: blocks, title page, imported FDX metadata, derived scenes/cast/locations, pagination, and portable workspace metadata.
- `hierarchy.ts`: Project/Show → Season → Episode → Act → Sequence → Scene → Beat vocabulary.
- `studio.ts`: active hierarchy, recognition, breakdown, FDX export, draft diff, and scene-card behavior.
- `television.ts`: seasons, episodes, recurring references, show bible, continuity, and arcs.
- `versioning.ts`: snapshots, alternate drafts, commits, and scene-aware changes.
- `project.ts` / `projectTypes.ts`: feature/television project and portable-path shapes.

Portable workspace metadata includes treatments, show bible, continuity, season arcs, scene summaries/tags/status, entity decisions, production revisions, and review comments. Script-derived values are not duplicated.
