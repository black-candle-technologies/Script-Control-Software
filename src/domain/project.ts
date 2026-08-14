/**
 * Project format model.
 *
 * An SCS project is a portable `.scs` folder, not a black-box database. Portable
 * metadata lives in plain JSON; an internal `.scs/` directory holds version
 * history and caches that can always be rebuilt. Screenplays are mirrored as
 * Fountain files so writers are never trapped in an application-specific format.
 *
 * Phase 0 documents the layout; reading and writing projects arrives later.
 * The canonical specification is docs/PROJECT_FORMAT.md.
 */

export type ProjectKind = "feature" | "show";

/** Portable project metadata: the contents of `scs.project.json`. */
export interface ProjectMeta {
  /** Schema version of the project file, so the format can evolve safely. */
  formatVersion: number;
  kind: ProjectKind;
  title: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/** One entry in the documented `.scs` folder layout, for display and docs. */
export interface LayoutEntry {
  path: string;
  note: string;
}

/**
 * The intended on-disk shape of a project. Mirrors docs/PROJECT_FORMAT.md and is
 * surfaced in the dashboard so the format is visible from day one.
 */
export const scsProjectLayout: LayoutEntry[] = [
  { path: "MyProject.scs/", note: "Portable project folder." },
  { path: "  scs.project.json", note: "Portable project metadata (the source of truth)." },
  { path: "  scripts/main.fountain", note: "Open-format screenplay fallback (episodes use numbered files)." },
  { path: "  treatments/", note: "Long-form development documents." },
  { path: "  notes/", note: "Loose research and notes." },
  { path: "  references/", note: "Images, links and supporting material." },
  { path: "  exports/", note: "Generated breakdowns and JSON / PDF exports." },
  { path: "  .scs/versions/", note: "Version-history working storage; portable history also lives in the manifest." },
  { path: "  .scs/cache/", note: "Disposable caches." },
];
