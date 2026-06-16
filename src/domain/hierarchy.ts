/**
 * Story hierarchy.
 *
 * A core differentiator of SCS is that story structure is *hierarchical* rather
 * than a flat board of interchangeable cards. The levels below are deliberately
 * distinct so that a writer can develop top-down (start with acts, break them
 * into sequences, then scenes, then beats) or bottom-up (organise a messy board
 * of beats into scenes, sequences and acts).
 *
 * These are descriptive models for Phase 0 — no editing behaviour is attached
 * yet. They drive the dashboard's hierarchy preview and document the intended
 * shape of the data layer.
 */

export interface HierarchyLevel {
  /** Stable identifier used by the data layer and UI keys. */
  id: string;
  /** Display name shown to the writer. */
  label: string;
  /** One line explaining what this level holds and how it differs from its neighbours. */
  description: string;
  /** Levels that only exist for some project types (e.g. seasons for TV). */
  scope: "shared" | "feature" | "television";
}

/**
 * The four structural levels every project shares, from largest to smallest.
 * Keeping Act / Sequence / Scene / Beat as separate, named tiers is what makes
 * SCS a story-architecture tool rather than a screenplay formatter with sticky
 * notes.
 */
export const coreStructure: HierarchyLevel[] = [
  {
    id: "act",
    label: "Act",
    description: "A major dramatic movement of the story — the broadest structural unit.",
    scope: "shared",
  },
  {
    id: "sequence",
    label: "Sequence",
    description: "A run of scenes bound together by a single tension, goal or location.",
    scope: "shared",
  },
  {
    id: "scene",
    label: "Scene",
    description: "A continuous unit of action in one place and time — the spine of the script.",
    scope: "shared",
  },
  {
    id: "beat",
    label: "Beat",
    description: "The smallest deliberate story moment inside a scene; the unit of a beat board.",
    scope: "shared",
  },
];

/** Feature film: Project → Act → Sequence → Scene → Beat. */
export const featureHierarchy: HierarchyLevel[] = [
  {
    id: "project",
    label: "Project",
    description: "The feature film as a whole — a single screenplay and its development workspace.",
    scope: "feature",
  },
  ...coreStructure,
];

/** Television: Show → Season → Episode → Act → Sequence → Scene → Beat. */
export const televisionHierarchy: HierarchyLevel[] = [
  {
    id: "show",
    label: "Show",
    description: "The series and its shared world, characters and show bible.",
    scope: "television",
  },
  {
    id: "season",
    label: "Season",
    description: "A produced run of episodes carrying its own season-long arc.",
    scope: "television",
  },
  {
    id: "episode",
    label: "Episode",
    description: "A single installment with its own script, beat board and breakdowns.",
    scope: "television",
  },
  ...coreStructure,
];
