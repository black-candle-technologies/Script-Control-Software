/**
 * Version-control model placeholders.
 *
 * SCS will offer Git-style version control with writer-friendly terminology.
 * These shapes leave room for snapshots, branches, commits and screenplay-aware
 * diffs without committing to a storage engine yet. No Git behaviour exists in
 * Phase 0.
 *
 * Writer-facing vocabulary (see README): Commit → Save Draft Version,
 * Branch → Alternate Draft, Merge → Combine Drafts, Diff → Compare Drafts.
 * See also: docs/DOMAIN_MODELS.md.
 */

/** A point-in-time capture of the whole project. */
export interface Snapshot {
  id: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Optional milestone label, e.g. "First Draft". */
  label?: string;
}

/** A named line of development — an "alternate draft" in writer terms. */
export interface Branch {
  id: string;
  name: string;
  /** Commit the branch currently points at. */
  headCommitId: string;
}

/** A saved draft version — a "commit" in Git terms. */
export interface Commit {
  id: string;
  /** Parent commits (more than one when drafts are combined). */
  parentIds: string[];
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** The writer's note describing what changed. */
  message: string;
}

/** A computed comparison between two commits. */
export interface Diff {
  fromCommitId: string;
  toCommitId: string;
  /** Human-readable, scene-aware summaries of what changed. */
  sceneChanges: SceneChangeSummary[];
}

/**
 * A screenplay-aware description of a change, e.g.
 * "Scene 14 moved from Sequence 3 to Sequence 2." Unlike a raw text diff, this
 * understands story structure.
 */
export interface SceneChangeSummary {
  sceneId: string;
  changeKind: "added" | "removed" | "moved" | "edited";
  /** One-line, writer-readable summary of the change. */
  summary: string;
}

/** The full version history of a project — the "project history" / repository. */
export interface ProjectHistory {
  commits: Commit[];
  branches: Branch[];
  snapshots: Snapshot[];
}
