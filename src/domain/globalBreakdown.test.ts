import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisEntities, CharacterProfile, LocationProfile, ObjectProfile, ProductionCategory, ProductionRow } from "./analysis.ts";
import {
  DEFAULT_GLOBAL_BREAKDOWN_VIEW_OPTIONS,
  filterAndSortGlobalBreakdownRows,
  globalBreakdownSortOptions,
  type GlobalBreakdownViewOptions,
} from "./globalBreakdown.ts";

const row = (category: ProductionCategory, item: string, sceneNumber: number, entityId?: string): ProductionRow => ({
  category,
  item,
  sceneNumber,
  sceneId: `scene-${sceneNumber}`,
  heading: `INT. SET ${sceneNumber} - DAY`,
  evidence: `${item} production evidence`,
  entityId,
});

const character = (id: string, name: string, firstScene: number, dialogueCount: number, sceneNumbers: number[], aliases: string[] = []): CharacterProfile => ({
  id,
  kind: "character",
  name,
  aliases,
  status: "detected",
  cueVariants: [name],
  firstScene,
  lastScene: sceneNumbers.at(-1) ?? firstScene,
  cueCount: dialogueCount,
  dialogueCount,
  dialogueWords: dialogueCount * 5,
  sceneCount: sceneNumbers.length,
  sceneNumbers,
  appearances: [],
  coAppearances: [],
  absenceGaps: [],
  dialogueLines: [],
});

const location = (id: string, name: string, firstScene: number, sceneNumbers: number[]): LocationProfile => ({
  id,
  kind: "location",
  name,
  aliases: [],
  status: "detected",
  firstScene,
  lastScene: sceneNumbers.at(-1) ?? firstScene,
  sceneCount: sceneNumbers.length,
  sceneNumbers,
  interiorExterior: ["INT."],
  timesOfDay: ["DAY"],
  appearances: [],
});

const object = (id: string, name: string, firstScene: number, mentions: number, sceneNumbers: number[], likelyOwner?: string): ObjectProfile => ({
  id,
  kind: "object",
  name,
  aliases: [],
  status: "detected",
  category: "prop",
  productionCategory: "props",
  confidence: 1,
  mentions,
  firstScene,
  lastScene: sceneNumbers.at(-1) ?? firstScene,
  sceneNumbers,
  likelyOwner,
  associations: [],
  continuity: [],
});

const entities: AnalysisEntities = {
  characters: [
    character("alice", "ALICE", 1, 5, [1]),
    character("bob", "BOB", 2, 2, [2, 4, 6], ["THE VETERAN"]),
    character("cara", "CARA", 3, 8, [3, 5]),
  ],
  locations: [
    location("office", "OFFICE", 1, [1, 3, 5]),
    location("park", "PARK", 2, [2]),
  ],
  objects: [
    object("key", "KEY", 1, 8, [1, 2, 3], "ALICE"),
    object("map", "MAP", 2, 2, [2]),
  ],
};

const withOptions = (patch: Partial<GlobalBreakdownViewOptions>): GlobalBreakdownViewOptions => ({
  ...DEFAULT_GLOBAL_BREAKDOWN_VIEW_OPTIONS,
  ...patch,
});

test("Cast exposes the requested appearance, line-count, and scene-count sorts", () => {
  assert.deepEqual(globalBreakdownSortOptions("cast").map((option) => option.label), [
    "Order of appearance",
    "Lines: most to least",
    "Lines: least to most",
    "Scenes: most to least",
    "Scenes: least to most",
  ]);
  const rows = [row("cast", "ALICE", 1, "alice"), row("cast", "BOB", 2, "bob"), row("cast", "CARA", 3, "cara")];
  const names = (sort: GlobalBreakdownViewOptions["sort"]) => filterAndSortGlobalBreakdownRows("cast", rows, entities, withOptions({ sort })).map((item) => item.item);
  assert.deepEqual(names("appearance"), ["ALICE", "BOB", "CARA"]);
  assert.deepEqual(names("lines-desc"), ["CARA", "ALICE", "BOB"]);
  assert.deepEqual(names("lines-asc"), ["BOB", "ALICE", "CARA"]);
  assert.deepEqual(names("scenes-desc"), ["BOB", "CARA", "ALICE"]);
  assert.deepEqual(names("scenes-asc"), ["ALICE", "CARA", "BOB"]);
});

test("search tokens can include matches or filter them out using entity metadata", () => {
  const rows = [row("cast", "ALICE", 1, "alice"), row("cast", "BOB", 2, "bob"), row("cast", "CARA", 3, "cara")];
  assert.deepEqual(
    filterAndSortGlobalBreakdownRows("cast", rows, entities, withOptions({ query: "veteran scene 4" })).map((item) => item.item),
    ["BOB"],
  );
  assert.deepEqual(
    filterAndSortGlobalBreakdownRows("cast", rows, entities, withOptions({ query: "veteran", filterMode: "exclude" })).map((item) => item.item),
    ["ALICE", "CARA"],
  );
});

test("locations sort by scene count while objects sort by mentions and searchable ownership", () => {
  const locations = [row("locations", "OFFICE", 1, "office"), row("locations", "PARK", 2, "park")];
  assert.deepEqual(
    filterAndSortGlobalBreakdownRows("locations", locations, entities, withOptions({ sort: "scenes-asc" })).map((item) => item.item),
    ["PARK", "OFFICE"],
  );

  const props = [row("props", "KEY", 1, "key"), row("props", "MAP", 2, "map")];
  assert.deepEqual(
    filterAndSortGlobalBreakdownRows("props", props, entities, withOptions({ sort: "mentions-desc" })).map((item) => item.item),
    ["KEY", "MAP"],
  );
  assert.deepEqual(
    filterAndSortGlobalBreakdownRows("props", props, entities, withOptions({ query: "alice" })).map((item) => item.item),
    ["KEY"],
  );
});
