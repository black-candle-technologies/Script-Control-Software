import assert from "node:assert/strict";
import test from "node:test";
import { deriveScenes, type CustomStoryStructure, type ScreenplayBlock } from "./screenplay.ts";
import {
  buildStoryTree,
  createStoryBeat,
  normalizeBeatEdit,
  reconcileStorySelection,
  resolveNewBeatTarget,
} from "./storyNavigation.ts";

const blocks: ScreenplayBlock[] = [
  { id: "a", type: "scene_heading", text: "INT. A - DAY" },
  { id: "a1", type: "action", text: "A" },
  { id: "b", type: "scene_heading", text: "EXT. B - NIGHT" },
  { id: "b1", type: "action", text: "B" },
  { id: "c", type: "scene_heading", text: "INT. C - DAY" },
];
const scenes = deriveScenes(blocks);

function structure(): CustomStoryStructure {
  return {
    acts: [{ id: "act-1", title: "Act I" }, { id: "act-2", title: "Act II" }],
    sequences: [
      { id: "sequence-1", actId: "act-1", title: "Sequence One", sceneIds: ["a"] },
      { id: "sequence-empty", actId: "act-1", title: "Empty Sequence", sceneIds: [] },
    ],
    beats: [
      { id: "beat-a", title: "Beat A", text: "A", sceneId: "a", status: "drafted", moments: [] },
      { id: "beat-sequence", text: "Sequence beat", sequenceId: "sequence-1", status: "idea", moments: [] },
      { id: "beat-free", text: "Free", status: "idea", moments: [] },
    ],
    sceneOrder: ["a", "b", "c"],
  };
}

test("story tree always emits Act to Sequence to Scene to Beat plus empty and Unassigned nodes", () => {
  const tree = buildStoryTree(structure(), scenes);
  assert.deepEqual(tree.map((node) => [node.kind, node.label]), [["act", "Act I"], ["act", "Act II"], ["unassigned", "Unassigned"]]);
  assert.deepEqual(tree[0].children.map((node) => node.label), ["Sequence One", "Empty Sequence"]);
  assert.equal(tree[0].children[0].children[0].kind, "scene");
  assert.equal(tree[0].children[0].children[0].children[0].kind, "beat");
  assert.equal(tree[0].children[1].children[0].label, "Empty sequence");
  assert.equal(tree[1].children[0].label, "No sequences");
  assert.deepEqual(tree[2].children.map((node) => node.kind), ["scene", "scene", "beat"]);
});

test("selection repairs deleted ids and selected scene wins beat targeting without first-scene fallback", () => {
  const model = structure();
  assert.deepEqual(reconcileStorySelection({ selectedSceneId: "missing", selectedBeatId: "beat-a" }, model, scenes), { selectedSceneId: "a", selectedBeatId: "beat-a" });
  assert.equal(resolveNewBeatTarget("b", "a", scenes).source, "selected");
  assert.equal(resolveNewBeatTarget("missing", "c", scenes).sceneId, "c");
  assert.deepEqual(resolveNewBeatTarget(undefined, undefined, scenes), { source: "unassigned", label: "Unassigned" });
  assert.equal(createStoryBeat(resolveNewBeatTarget(undefined, undefined, scenes), "new").sceneId, undefined);
});

test("beat edits normalize title, status, color, assignment, and moments", () => {
  const model = structure();
  const beat = model.beats[2];
  const edited = normalizeBeatEdit(beat, {
    title: "  Revised  ", text: "Body", color: "not a color!", sceneId: "a", sequenceId: "missing",
    status: "complete", moments: [{ id: " moment ", text: "Moment" }, { id: "", text: "bad" }],
  }, model, scenes);
  assert.equal(edited.title, "Revised");
  assert.equal(edited.color, undefined);
  assert.equal(edited.sceneId, "a");
  assert.equal(edited.sequenceId, "sequence-1");
  assert.deepEqual(edited.moments, [{ id: "moment", text: "Moment" }]);
});
