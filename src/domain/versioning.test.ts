import assert from "node:assert/strict";
import test from "node:test";

import { defaultProjectWorkspace, type ProjectSession } from "./projectWorkspace.ts";
import type { ScreenplayBlock, ScreenplayDocument } from "./screenplay.ts";
import {
  addMilestone,
  compareSnapshots,
  createAlternateDraft,
  createProjectSnapshot,
  createVersionHistory,
  mergeSnapshots,
  restoreProjectSnapshot,
  saveSnapshot,
} from "./versioning.ts";

const blocks = (prefix: string): ScreenplayBlock[] => [
  { id: `${prefix}-heading`, type: "scene_heading", text: "INT. ROOM - DAY" },
  { id: `${prefix}-action`, type: "action", text: "A quiet room." },
  { id: `${prefix}-character`, type: "character", text: "MARA" },
  { id: `${prefix}-dialogue`, type: "dialogue", text: "Hello." },
];

const document = (id: string, title: string): ScreenplayDocument => ({
  id,
  title,
  titlePage: { title, author: "Writer" },
  blocks: blocks(id),
  sceneNotes: {},
});

const session = (): ProjectSession => ({
  schemaVersion: 4,
  projectId: "project-fixed",
  name: "Versioning Test",
  projectType: "television",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  documents: [document("doc-1", "Pilot"), document("doc-2", "Episode 2")],
  versions: [],
  versionHistory: { snapshots: [], branches: [], milestones: [], activeBranchId: "main" },
  workspace: defaultProjectWorkspace(),
  projectPath: "C:/projects/versioning-test",
  activeDocumentId: "doc-1",
});

const snapshot = (value: ProjectSession, id: string, name = id) => createProjectSnapshot(value, {
  id,
  name,
  createdAt: `2026-01-0${id.length}T00:00:00.000Z`,
});

test("named project snapshots, alternate drafts, and milestones are immutable", () => {
  const project = session();
  const base = snapshot(project, "base", "Table Read Draft");
  project.documents[0].blocks[1].text = "Changed after capture.";
  assert.equal(base.session.documents[0].blocks[1].text, "A quiet room.");

  const main = createVersionHistory(base);
  const alternate = createAlternateDraft(main, { id: "dark-ending", name: "Dark Ending", fromSnapshotId: "base" });
  const alternateSession = restoreProjectSnapshot(base);
  alternateSession.documents[0].blocks[1].text = "The room is dark.";
  const saved = saveSnapshot(alternate, snapshot(alternateSession, "dark-1"), "dark-ending");
  const released = addMilestone(saved, { id: "table-read", name: "Table Read", snapshotId: "dark-1", description: "Ready for actors." });

  assert.equal(main.branches.length, 1);
  assert.equal(alternate.branches.find((branch) => branch.id === "dark-ending")?.headSnapshotId, "base");
  assert.equal(released.branches.find((branch) => branch.id === "dark-ending")?.headSnapshotId, "dark-1");
  assert.deepEqual(released.snapshots.find((item) => item.id === "dark-1")?.parentIds, ["base"]);
  assert.equal(released.milestones[0].snapshotId, "dark-1");
  const restored = restoreProjectSnapshot(base);
  restored.name = "Mutated restore";
  assert.equal(base.session.name, "Versioning Test");
});

test("arbitrary snapshot comparisons expose document, block, and metadata modes", () => {
  const before = session();
  const after = structuredClone(before);
  after.documents[0].titlePage.title = "Revised Pilot";
  after.documents[0].blocks[1].text = "The room shakes.";
  after.documents[0].blocks.splice(1, 0, { id: "doc-1-new", type: "action", text: "A clock stops." });
  const character = after.documents[0].blocks.findIndex((block) => block.id === "doc-1-character");
  const dialogue = after.documents[0].blocks.findIndex((block) => block.id === "doc-1-dialogue");
  [after.documents[0].blocks[character], after.documents[0].blocks[dialogue]] = [after.documents[0].blocks[dialogue], after.documents[0].blocks[character]];
  after.documents.pop();
  after.documents.push(document("doc-3", "Episode 3"));
  after.workspace.series.showBible = "The signal cannot cross water.";
  const base = snapshot(before, "base");
  const revised = snapshot(after, "revised");

  const documents = compareSnapshots(base, revised, "document");
  assert.deepEqual(documents.documentChanges.map((change) => [change.documentId, change.kind]), [
    ["doc-1", "modified"],
    ["doc-2", "removed"],
    ["doc-3", "added"],
  ]);

  const blockChanges = compareSnapshots(base, revised, "block").blockChanges;
  assert.ok(blockChanges.some((change) => change.blockId === "doc-1-action" && change.kind === "edited"));
  assert.ok(blockChanges.some((change) => change.blockId === "doc-1-new" && change.kind === "added"));
  assert.ok(blockChanges.some((change) => change.blockId === "doc-1-character" && change.kind === "moved"));
  assert.ok(blockChanges.some((change) => change.documentId === "doc-2" && change.kind === "removed"));
  assert.ok(blockChanges.some((change) => change.documentId === "doc-3" && change.kind === "added"));

  const metadata = compareSnapshots(base, revised, "metadata").metadataChanges;
  assert.ok(metadata.some((change) => change.path === "/workspace/series/showBible"));
  assert.ok(metadata.some((change) => change.path === "/documents/doc-1/titlePage/title"));
  assert.ok(metadata.every((change) => !change.path.includes("/blocks/")));

  assert.ok(compareSnapshots(base, revised, "page").metadataChanges.length > 0);
  assert.ok(compareSnapshots(base, revised, "scene").metadataChanges.length > 0);
  assert.equal(compareSnapshots(base, revised, "dialogue").blockChanges.filter((change) => change.documentId === "doc-1").length, 2);
  assert.ok(compareSnapshots(base, revised, "character").metadataChanges.length > 0);
  assert.ok(compareSnapshots(base, revised, "episode").metadataChanges.length > 0);
  assert.ok(compareSnapshots(base, revised, "season").metadataChanges.length > 0);
});

test("three-way merge combines independent edits and reports deterministic edit and deletion conflicts", () => {
  const ancestor = session();
  const ours = structuredClone(ancestor);
  const theirs = structuredClone(ancestor);

  ours.workspace.series.showBible = "Our canon.";
  ours.documents[0].blocks.find((block) => block.id === "doc-1-action")!.text = "Our room burns.";
  ours.documents[0].blocks.find((block) => block.id === "doc-1-character")!.text = "MARA PRIME";
  ours.documents[0].blocks.splice(2, 0, { id: "ours-new", type: "action", text: "Our new beat." });
  ours.documents[0].sceneNotes["doc-1-heading"] = "Keep our staging.";

  theirs.workspace.series.showBible = "Their canon.";
  theirs.documents[0].blocks.find((block) => block.id === "doc-1-action")!.text = "Their room floods.";
  theirs.documents[0].blocks = theirs.documents[0].blocks.filter((block) => block.id !== "doc-1-character");
  theirs.documents[0].blocks.splice(2, 0, { id: "theirs-new", type: "action", text: "Their new beat." });
  theirs.documents[0].workspace = { treatment: "Their treatment.", showBible: "", continuity: "", seasonArc: "", productionNotes: "", comments: [], entityStatuses: {} };
  theirs.documents[1].blocks.find((block) => block.id === "doc-2-action")!.text = "Episode two changes independently.";

  const baseSnapshot = snapshot(ancestor, "base");
  const ourSnapshot = snapshot(ours, "ours");
  const theirSnapshot = snapshot(theirs, "theirs");
  const result = mergeSnapshots(baseSnapshot, ourSnapshot, theirSnapshot);
  const repeated = mergeSnapshots(baseSnapshot, ourSnapshot, theirSnapshot);

  assert.deepEqual(result, repeated);
  assert.equal(result.clean, false);
  assert.deepEqual(result.conflicts.map((conflict) => [conflict.path, conflict.kind]), [
    ["/workspace/series/showBible", "value"],
    ["/documents/doc-1/blocks/doc-1-action/text", "value"],
    ["/documents/doc-1/blocks/doc-1-character", "delete-edit"],
  ]);
  assert.equal(result.merged.workspace.series.showBible, "Our canon.");
  assert.equal(result.merged.documents[0].blocks.find((block) => block.id === "doc-1-action")?.text, "Our room burns.");
  assert.equal(result.merged.documents[0].blocks.find((block) => block.id === "doc-1-character")?.text, "MARA PRIME");
  assert.ok(result.merged.documents[0].blocks.some((block) => block.id === "ours-new"));
  assert.ok(result.merged.documents[0].blocks.some((block) => block.id === "theirs-new"));
  assert.equal(result.merged.documents[0].workspace?.treatment, "Their treatment.");
  assert.equal(result.merged.documents[0].sceneNotes["doc-1-heading"], "Keep our staging.");
  assert.equal(result.merged.documents[1].blocks.find((block) => block.id === "doc-2-action")?.text, "Episode two changes independently.");
  assert.equal(ancestor.documents[0].blocks.find((block) => block.id === "doc-1-action")?.text, "A quiet room.");

  const preferTheirs = mergeSnapshots(baseSnapshot, ourSnapshot, theirSnapshot, "theirs");
  assert.equal(preferTheirs.merged.documents[0].blocks.find((block) => block.id === "doc-1-action")?.text, "Their room floods.");
  assert.ok(!preferTheirs.merged.documents[0].blocks.some((block) => block.id === "doc-1-character"));
});
