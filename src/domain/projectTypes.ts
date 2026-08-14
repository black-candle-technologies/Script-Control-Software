import type { HierarchyLevel } from "./hierarchy.ts";
import { featureHierarchy, televisionHierarchy } from "./hierarchy.ts";

/**
 * The two kinds of project SCS is being built around. Phase 0 only describes
 * them; creating and opening projects arrives in later phases.
 */
export interface ProjectType {
  id: "feature" | "show";
  /** Card title. */
  name: string;
  /** Short positioning line for the card. */
  tagline: string;
  /** Longer description of what this project type is for. */
  description: string;
  /** The story hierarchy this project type uses. */
  hierarchy: HierarchyLevel[];
}

export const projectTypes: ProjectType[] = [
  {
    id: "feature",
    name: "Feature Film",
    tagline: "One screenplay, developed end to end.",
    description:
      "A single feature script with its own beat board, treatment, characters, " +
      "objects, locations and version history.",
    hierarchy: featureHierarchy,
  },
  {
    id: "show",
    name: "Television Show",
    tagline: "Seasons, episodes and a shared show bible.",
    description:
      "A series workspace where every season and episode lives in one project, " +
      "connected to a shared bible, recurring characters and season arcs.",
    hierarchy: televisionHierarchy,
  },
];
