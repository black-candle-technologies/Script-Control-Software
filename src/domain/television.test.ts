import assert from "node:assert/strict";
import test from "node:test";
import { aggregateEpisodes, type ScreenplayDocument } from "./index.ts";

const episode = (character: string, location: string): ScreenplayDocument => ({
  titlePage: { title: "Episode", author: "" }, blocks: [], sceneNotes: {},
  characters: [{ id: character, canonicalName: character, displayName: character, aliases: [], firstAppearanceBlockId: "b1", sceneIds: [], dialogueBlockIds: [] }],
  locations: [{ id: location, canonicalName: location, displayName: location, interiorExteriorUsages: [], sceneIds: [] }],
});

test("television aggregation merges show-level characters and locations", () => {
  assert.deepEqual(aggregateEpisodes([episode("ELI", "NEWSROOM"), episode("ELI", "ROOF")]), {
    characters: ["ELI"], locations: ["NEWSROOM", "ROOF"],
  });
});
