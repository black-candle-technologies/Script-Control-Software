import type { FoundationStatus } from "./status.ts";

/**
 * Core workspace panels exposed by the writing and development workspace.
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
    status: "active",
  },
  {
    id: "beat-board",
    title: "Beat Board",
    summary: "Hierarchical beats inside scenes, sequences and acts — not a flat board.",
    status: "active",
  },
  {
    id: "treatment",
    title: "Treatment",
    summary: "Long-form development documents linked to scenes, beats and characters.",
    status: "active",
  },
  {
    id: "characters",
    title: "Characters",
    summary: "Character sheets built from recognised dialogue and appearances.",
    status: "active",
  },
  {
    id: "objects",
    title: "Objects / Props",
    summary: "Tracking for recurring props and story-critical objects across scenes.",
    status: "active",
  },
  {
    id: "locations",
    title: "Locations",
    summary: "Location sheets derived from scene headings, with scene and page counts.",
    status: "active",
  },
  {
    id: "versions",
    title: "Versions",
    summary: "Writer-friendly, Git-style snapshots, branches and draft comparisons.",
    status: "active",
  },
  {
    id: "breakdowns",
    title: "Breakdowns",
    summary: "Deterministic, compiler-generated story and production reports.",
    status: "active",
  },
];
