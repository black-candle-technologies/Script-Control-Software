/**
 * Sample project content for the writing workspace.
 *
 * The screenplay itself lives in samples/sample.fountain: one file shared by
 * the frontend (via Vite `?raw`) and the Rust `get_sample_screenplay` command
 * (via `include_str!`), so the two can never drift apart.
 *
 * All panels derive their state from the screenplay itself.
 */

import sampleFountain from "../../samples/sample.fountain?raw";
import { parseFountain } from "./fountain.ts";
import type { ScreenplayDocument } from "./screenplay.ts";

export function sampleScreenplay(): ScreenplayDocument {
  return parseFountain(sampleFountain);
}
