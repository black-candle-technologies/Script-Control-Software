import assert from "node:assert/strict";
import test from "node:test";
import { aggregateEpisodes, type ScreenplayDocument } from "./index.ts";

const episode = (character: string, location: string): ScreenplayDocument => ({
  titlePage: { title: "Episode", author: "" }, sceneNotes: {},
  blocks: [
    { id: `scene-${location}`, type: "scene_heading", text: `INT. ${location} - DAY` },
    { id: `character-${character}`, type: "character", text: character },
    { id: `dialogue-${character}`, type: "dialogue", text: "Hello." },
  ],
  // Stale imported caches must not win over live edits.
  characters: [],
  locations: [],
});

test("television aggregation merges show-level characters and locations", () => {
  assert.deepEqual(aggregateEpisodes([episode("ELI", "NEWSROOM"), episode("ELI", "ROOF")]), {
    characters: ["ELI"], locations: ["NEWSROOM", "ROOF"],
  });
});
