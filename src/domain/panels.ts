import type { FoundationStatus } from "./status.ts";

/**
 * The workspace panels SCS will eventually offer. In Phase 0 these are
 * placeholders — they communicate the shape of the product without pretending
 * the features exist yet. Every panel is `planned`.
 */
export interface WorkspacePanel {
  id: string;
  title: string;
  /** What this panel will do once it is built. */
  summary: string;
  status: FoundationStatus;
}

export const workspacePanels: WorkspacePanel[] = [
  {
    id: "screenplay",
    title: "Screenplay",
    summary: "Professionally formatted, FDX-compatible script editing and viewing.",
    status: "planned",
  },
  {
    id: "beat-board",
    title: "Beat Board",
    summary: "Hierarchical beats inside scenes, sequences and acts — not a flat board.",
    status: "planned",
  },
  {
    id: "treatment",
    title: "Treatment",
    summary: "Long-form development documents linked to scenes, beats and characters.",
    status: "planned",
  },
  {
    id: "characters",
    title: "Characters",
    summary: "Character sheets built from recognised dialogue and appearances.",
    status: "planned",
  },
  {
    id: "objects",
    title: "Objects / Props",
    summary: "Tracking for recurring props and story-critical objects across scenes.",
    status: "planned",
  },
  {
    id: "locations",
    title: "Locations",
    summary: "Location sheets derived from scene headings, with scene and page counts.",
    status: "planned",
  },
  {
    id: "versions",
    title: "Versions",
    summary: "Writer-friendly, Git-style snapshots, branches and draft comparisons.",
    status: "planned",
  },
  {
    id: "breakdowns",
    title: "Breakdowns",
    summary: "Deterministic, compiler-generated story and production reports.",
    status: "planned",
  },
];
