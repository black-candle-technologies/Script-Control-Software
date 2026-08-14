import assert from "node:assert/strict";
import test from "node:test";
import { parseFountain } from "./fountain.ts";
import { moveStoryScene, resolveStoryStructure } from "./story.ts";

test("custom story structures keep hierarchy and reconcile regenerated scene ids", () => {
  const first = parseFountain("INT. HOME - DAY\n\nOne.\n\nEXT. ROAD - NIGHT\n\nTwo.\n");
  const structure = resolveStoryStructure(first.blocks);
  structure.acts.push({ id: "act-2", title: "Act II" });
  structure.sequences.push({ id: "sequence-2", actId: "act-2", title: "Chase", sceneIds: [structure.sceneOrder[1]] });
  structure.sequences[0].sceneIds = [structure.sceneOrder[0]];
  structure.beats.push({ id: "beat-1", text: "Decision", sceneId: structure.sceneOrder[1], status: "idea", moments: [{ id: "moment-1", text: "Looks back" }] });

  const moved = moveStoryScene(structure, structure.sceneOrder[1], 0);
  assert.equal(moved.sceneOrder[0], structure.sceneOrder[1]);
  assert.equal(resolveStoryStructure(first.blocks, moved).beats[0].moments[0].text, "Looks back");
});

test("new scenes enter the first valid sequence without duplicating assignments", () => {
  const doc = parseFountain("INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB.\n");
  const structure = resolveStoryStructure(doc.blocks);
  structure.sequences.push({ id: "extra", actId: structure.acts[0].id, title: "Extra", sceneIds: [structure.sceneOrder[0]] });
  const resolved = resolveStoryStructure([
    ...doc.blocks,
    { id: "scene-c", type: "scene_heading", text: "INT. C - DAY" },
    { id: "action-c", type: "action", text: "C." },
  ], structure);
  const assigned = resolved.sequences.flatMap((sequence) => sequence.sceneIds);
  assert.equal(new Set(assigned).size, 3);
  assert.equal(assigned.filter((id) => id === "scene-c").length, 1);
});

test("known scenes can remain intentionally unassigned", () => {
  const doc = parseFountain("INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB.\n");
  const structure = resolveStoryStructure(doc.blocks);
  const removedSceneId = structure.sceneOrder[0];
  structure.sequences = structure.sequences.map((sequence) => ({
    ...sequence,
    sceneIds: sequence.sceneIds.filter((id) => id !== removedSceneId),
  }));

  const resolved = resolveStoryStructure(doc.blocks, structure);
  assert.ok(resolved.sceneOrder.includes(removedSceneId));
  assert.ok(resolved.sequences.every((sequence) => !sequence.sceneIds.includes(removedSceneId)));
});
