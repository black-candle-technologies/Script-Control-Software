import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBoardScenePlacement,
  boardPlacementOptions,
  neighboringBoardPlacement,
  resolveBoardPointerPlacement,
} from "./storyPlacement.ts";
import type { CustomStoryStructure } from "./screenplay.ts";

function structure(): CustomStoryStructure {
  return {
    acts: [{ id: "act", title: "Act" }],
    sequences: [
      { id: "one", actId: "act", title: "One", sceneIds: ["a", "b", "c"] },
      { id: "two", actId: "act", title: "Two", sceneIds: ["d"] },
      { id: "empty", actId: "act", title: "Empty", sceneIds: [] },
    ],
    beats: [],
    sceneOrder: ["a", "b", "c", "d", "e"],
  };
}

test("pointer midpoint resolves to the exact before/after/append/empty placement preview", () => {
  assert.deepEqual(resolveBoardPointerPlacement({ sequenceId: "one", targetSceneId: "b", targetTop: 100, targetHeight: 40, pointerY: 119, sequenceSceneCount: 3 }), { kind: "before", sequenceId: "one", anchorSceneId: "b" });
  assert.deepEqual(resolveBoardPointerPlacement({ sequenceId: "one", targetSceneId: "b", targetTop: 100, targetHeight: 40, pointerY: 120, sequenceSceneCount: 3 }), { kind: "after", sequenceId: "one", anchorSceneId: "b" });
  assert.deepEqual(resolveBoardPointerPlacement({ sequenceId: "one", sequenceSceneCount: 3 }), { kind: "append", sequenceId: "one" });
  assert.deepEqual(resolveBoardPointerPlacement({ sequenceId: "empty", sequenceSceneCount: 0 }), { kind: "empty", sequenceId: "empty" });
});

test("placement handles source-index removal, cross-sequence moves, empty lanes, and Unassigned", () => {
  const original = structure();
  const after = applyBoardScenePlacement(original, "a", { kind: "after", sequenceId: "one", anchorSceneId: "c" });
  assert.deepEqual(after.sequences[0].sceneIds, ["b", "c", "a"]);
  assert.deepEqual(after.sceneOrder, ["b", "c", "a", "d", "e"]);
  const moved = applyBoardScenePlacement(after, "c", { kind: "before", sequenceId: "two", anchorSceneId: "d" });
  assert.deepEqual(moved.sequences.map((sequence) => sequence.sceneIds), [["b", "a"], ["c", "d"], []]);
  const empty = applyBoardScenePlacement(moved, "e", { kind: "empty", sequenceId: "empty" });
  assert.deepEqual(empty.sequences[2].sceneIds, ["e"]);
  const unassigned = applyBoardScenePlacement(empty, "c", { kind: "unassigned" });
  assert.equal(unassigned.sequences.some((sequence) => sequence.sceneIds.includes("c")), false);
  assert.deepEqual(original.sequences[0].sceneIds, ["a", "b", "c"]);
});

test("self/no-op/invalid placements are deterministic and return original identity", () => {
  const original = structure();
  assert.equal(applyBoardScenePlacement(original, "b", { kind: "before", sequenceId: "one", anchorSceneId: "b" }), original);
  assert.equal(applyBoardScenePlacement(original, "a", { kind: "before", sequenceId: "one", anchorSceneId: "b" }), original);
  assert.equal(applyBoardScenePlacement(original, "missing", { kind: "append", sequenceId: "one" }), original);
  assert.equal(applyBoardScenePlacement(original, "a", { kind: "append", sequenceId: "missing" }), original);
});

test("keyboard options expose beginning/end/empty/unassigned and neighboring moves", () => {
  const original = structure();
  const options = boardPlacementOptions(original, "b");
  assert.deepEqual(options.map((item) => item.id), ["one:start", "one:end", "two:start", "two:end", "empty:empty", "unassigned"]);
  assert.deepEqual(neighboringBoardPlacement(original, "b", -1), { kind: "before", sequenceId: "one", anchorSceneId: "a" });
  assert.deepEqual(neighboringBoardPlacement(original, "b", 1), { kind: "after", sequenceId: "one", anchorSceneId: "c" });
  assert.equal(neighboringBoardPlacement(original, "a", -1), undefined);
});
