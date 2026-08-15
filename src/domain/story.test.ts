import assert from "node:assert/strict";
import test from "node:test";
import { parseFountain } from "./fountain.ts";
import { applyStorySceneOrder, moveStoryScene, resolveStoryStructure, sceneOrderForSequences } from "./story.ts";

test("custom story structures keep hierarchy and reconcile regenerated scene ids", () => {
  const first = parseFountain("INT. HOME - DAY\n\nOne.\n\nEXT. ROAD - NIGHT\n\nTwo.\n");
  const structure = resolveStoryStructure(first.blocks);
  structure.sequences.push({ id: "sequence-1", actId: structure.acts[0].id, title: "Opening", sceneIds: [] });
  structure.acts.push({ id: "act-2", title: "Act II" });
  structure.sequences.push({ id: "sequence-2", actId: "act-2", title: "Chase", sceneIds: [structure.sceneOrder[1]] });
  structure.sequences[0].sceneIds = [structure.sceneOrder[0]];
  structure.beats.push({ id: "beat-1", text: "Decision", sceneId: structure.sceneOrder[1], status: "idea", moments: [{ id: "moment-1", text: "Looks back" }] });
  structure.beats.push({ id: "beat-2", title: "Arrival", text: "They arrive", status: "drafted", moments: [], source: "fdx", board: { left: 20, top: 40, width: 200, height: 120 } });
  structure.connections = [{ id: "connection-1", fromId: "beat-1", toId: "beat-2", color: "#AAAABBBBCCCC" }];
  structure.board = { id: "board-1", width: 1200, height: 800, zoomLevel: 90 };

  const moved = moveStoryScene(structure, structure.sceneOrder[1], 0);
  assert.equal(moved.sceneOrder[0], structure.sceneOrder[1]);
  const resolved = resolveStoryStructure(first.blocks, moved);
  assert.equal(resolved.beats[0].moments[0].text, "Looks back");
  assert.equal(resolved.beats[1].title, "Arrival");
  assert.equal(resolved.connections?.[0].toId, "beat-2");
  assert.equal(resolved.board?.zoomLevel, 90);
});

test("sequences are explicit and new scenes remain unassigned", () => {
  const doc = parseFountain("INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB.\n");
  const structure = resolveStoryStructure(doc.blocks);
  assert.deepEqual(structure.sequences, []);
  structure.sequences.push({ id: "extra", actId: structure.acts[0].id, title: "Extra", sceneIds: [structure.sceneOrder[0]] });
  const resolved = resolveStoryStructure([
    ...doc.blocks,
    { id: "scene-c", type: "scene_heading", text: "INT. C - DAY" },
    { id: "action-c", type: "action", text: "C." },
  ], structure);
  const assigned = resolved.sequences.flatMap((sequence) => sequence.sceneIds);
  assert.deepEqual(assigned, [structure.sceneOrder[0]]);
  assert.equal(assigned.includes("scene-c"), false);
});

test("known scenes can remain intentionally unassigned", () => {
  const doc = parseFountain("INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB.\n");
  const structure = resolveStoryStructure(doc.blocks);
  structure.sequences.push({ id: "sequence-1", actId: structure.acts[0].id, title: "Sequence", sceneIds: [...structure.sceneOrder] });
  const removedSceneId = structure.sceneOrder[0];
  structure.sequences = structure.sequences.map((sequence) => ({
    ...sequence,
    sceneIds: sequence.sceneIds.filter((id) => id !== removedSceneId),
  }));

  const resolved = resolveStoryStructure(doc.blocks, structure);
  assert.ok(resolved.sceneOrder.includes(removedSceneId));
  assert.ok(resolved.sequences.every((sequence) => !sequence.sceneIds.includes(removedSceneId)));
});

test("applying board order moves whole scene chunks without dropping unlisted scenes", () => {
  const doc = parseFountain("Title: Test\n\nINT. A - DAY\n\nThe first room.\n\nINT. B - NIGHT\n\nThe second room.\n\nINT. C - DAY\n\nThe third room.\n");
  const scenes = resolveStoryStructure(doc.blocks).sceneOrder;
  const reordered = applyStorySceneOrder(doc.blocks, [scenes[2], scenes[0]]);
  const headings = reordered.filter((block) => block.type === "scene_heading").map((block) => block.text);
  assert.deepEqual(headings, ["INT. C - DAY", "INT. A - DAY", "INT. B - NIGHT"]);
  assert.equal(reordered.find((block) => block.type === "action" && block.text === "The third room.")?.id, doc.blocks.find((block) => block.text === "The third room.")?.id);
});

test("sequence order produces screenplay order without losing unassigned scenes", () => {
  const doc = parseFountain("INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB.\n\nINT. C - DAY\n\nC.\n\nINT. D - DAY\n\nD.\n");
  const structure = resolveStoryStructure(doc.blocks);
  const [a, b, c, d] = structure.sceneOrder;
  structure.sequences = [
    { id: "opening", actId: structure.acts[0].id, title: "Opening", sceneIds: [a, b] },
    { id: "closing", actId: structure.acts[0].id, title: "Closing", sceneIds: [d] },
  ];

  assert.deepEqual(sceneOrderForSequences(structure, [
    structure.sequences[1],
    structure.sequences[0],
    { id: "orphan", actId: "missing-act", title: "Orphan", sceneIds: [c] },
  ]), [d, a, b, c]);
});

test("sequence scene order is authoritative and assigning an existing first scene does not append a copy", () => {
  const doc = parseFountain("INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB.\n\nINT. C - DAY\n\nC.\n");
  const structure = resolveStoryStructure(doc.blocks);
  const [a, b, c] = structure.sceneOrder;
  const sequences = [{
    id: "opening",
    actId: structure.acts[0].id,
    title: "Opening",
    sceneIds: [a],
  }];

  const assignedOrder = sceneOrderForSequences(structure, sequences);
  assert.deepEqual(assignedOrder, [a, b, c]);
  assert.equal(new Set(assignedOrder).size, 3);

  sequences[0].sceneIds = [c, a];
  assert.deepEqual(sceneOrderForSequences(structure, sequences), [c, a, b]);
});

test("board scene labels stay stable when screenplay order changes", () => {
  const doc = parseFountain("INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB.\n\nINT. C - DAY\n\nC.\n");
  const original = resolveStoryStructure(doc.blocks);
  const [a, , c] = original.sceneOrder;
  const reorderedBlocks = applyStorySceneOrder(doc.blocks, [c, a]);
  const resolved = resolveStoryStructure(reorderedBlocks, { ...original, sceneOrder: [c, a] });

  assert.equal(resolved.sceneLabels?.[c], "3");
  assert.equal(resolved.sceneLabels?.[a], "1");
});
