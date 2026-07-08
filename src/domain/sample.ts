/**
 * Sample project content for the writing workspace.
 *
 * The screenplay itself lives in samples/sample.fountain — one file shared by
 * the frontend (via Vite `?raw`) and the Rust `get_sample_screenplay` command
 * (via `include_str!`), so the two can never drift apart.
 *
 * Everything else in this file is clearly-labelled sample/seed data for panels
 * whose real data source (the recognition engine, version control) is planned.
 */

import sampleFountain from "../../samples/sample.fountain?raw";
import { parseFountain } from "./fountain.ts";
import type { ScreenplayDocument } from "./screenplay.ts";

export function sampleScreenplay(): ScreenplayDocument {
  return parseFountain(sampleFountain);
}

/** Hand-written bios for the sample cast; other characters get a placeholder. */
export const sampleCharacterBios: Record<string, string> = {
  MARA: "30s. Precise, guarded, always mid-route to somewhere else. Reads maps the way other people read faces.",
  DELL: "70s. Paper-thin and unhurried. Carries the shoebox like it weighs nothing and everything.",
};

/** Seeded props — the recognition engine that will detect these is planned. */
export const sampleProps = [
  { name: "Shoebox", description: "Tied with string, 'ROSALIND' pencilled on the lid.", firstScene: 1, continuity: "Knot is tied twice in Sc. 1; Mara must not open it before Sc. 3." },
  { name: "Road atlas", description: "Mara's — dog-eared, one highway traced repeatedly.", firstScene: 1, continuity: "" },
  { name: "Reading light", description: "The only light on the night bus.", firstScene: 1, continuity: "Flickers out at the end of Sc. 3." },
];

/** Sample draft history — real version control is planned. */
export const sampleVersions = [
  { id: "v3", label: "Current draft", note: "Rest-stop scene rewritten; Dell exits earlier.", when: "Today", milestone: false },
  { id: "v2", label: "Draft 2", note: "Added the shoebox through-line.", when: "3 days ago", milestone: false },
  { id: "v1", label: "First Draft", note: "Initial three-scene sketch.", when: "Last week", milestone: true },
];

/** Sample TV workspace — episode tabs demonstrate the planned direction. */
export const sampleEpisodes = ["Pilot", "Episode 2", "Episode 3", "Episode 4", "Finale"];
