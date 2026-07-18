import assert from "node:assert/strict";
import test from "node:test";
import { emptyWorkspace, type ScreenplayBlock, type ScreenplayDocument } from "./screenplay.ts";
import {
  lockPages,
  buildCharacterSides,
  buildSceneSides,
  dialogueOnly,
  markChangedBlocks,
  nextRevisionColor,
  productionPages,
  productionReports,
  productionReportsCsv,
  revisionReportMarkdown,
  revisionExportMetadata,
  setSceneOmitted,
  summarizeRevision,
  type RevisionSet,
} from "./revisionProduction.ts";

const block = (id: string, type: ScreenplayBlock["type"], text: string, metadata?: Record<string, string>): ScreenplayBlock => ({ id, type, text, metadata });
const document = (blocks: ScreenplayBlock[], workspace?: ScreenplayDocument["workspace"]): ScreenplayDocument => ({
  titlePage: { title: "Production Test", author: "" },
  blocks,
  sceneNotes: {},
  workspace,
});
const blueRevision = (blockIds: string[] = []): RevisionSet => ({
  id: "revision-blue",
  label: "Blue Revision",
  color: "Blue",
  createdAt: "2026-07-18T12:00:00Z",
  blockIds,
});

test("revision colors advance and changed blocks receive exportable revision runs", () => {
  assert.equal(nextRevisionColor("White"), "Blue");
  assert.equal(nextRevisionColor("Cherry"), "White");
  const before = document([
    block("scene-1", "scene_heading", "INT. ROOM - DAY"),
    block("action-1", "action", "Old action."),
    block("removed-1", "dialogue", "Cut line."),
  ]);
  const current = document([
    block("scene-1", "scene_heading", "INT. ROOM - DAY"),
    block("action-1", "action", "New action."),
    block("added-1", "dialogue", "New line."),
  ], { ...emptyWorkspace(), productionDraftLabel: "Second Blue", omittedSceneIds: ["scene-1"] });

  const marked = markChangedBlocks(before, current, blueRevision());
  assert.deepEqual(marked.revision.blockIds, ["action-1", "added-1"]);
  assert.equal(marked.document.blocks[0], current.blocks[0]);
  assert.equal(marked.document.blocks[1].textRuns?.[0].revisionId, "revision-blue");
  assert.equal(marked.document.blocks[1].textRuns?.[0].metadata.RevisionID, "revision-blue");
  assert.equal(current.blocks[1].textRuns, undefined);

  const summary = summarizeRevision(before, marked.document, marked.revision);
  assert.deepEqual(summary.addedBlockIds, ["added-1"]);
  assert.deepEqual(summary.editedBlockIds, ["action-1"]);
  assert.deepEqual(summary.removedBlockIds, ["removed-1"]);
  assert.deepEqual(summary.changedSceneIds, ["scene-1"]);
  assert.deepEqual(summary.revisedPages, ["1"]);
  assert.equal(summary.totalChanges, 3);

  const metadata = revisionExportMetadata(marked.document, [marked.revision]);
  assert.equal(metadata.draftLabel, "Second Blue");
  assert.deepEqual(metadata.omittedSceneIds, ["scene-1"]);
  assert.equal(metadata.pages[0].color, "Blue");
  assert.notEqual(metadata.revisions[0].blockIds, marked.revision.blockIds);
});

test("locked pagination assigns A-pages to overflow without renumbering later pages", () => {
  const originalBlocks = Array.from({ length: 30 }, (_, index) => block(`base-${index}`, "action", `Line ${index}`));
  const original = document(originalBlocks);
  const lock = lockPages(original);
  assert.deepEqual(lock.pages.map((page) => page.number), [1, 2]);

  const inserted = Array.from({ length: 10 }, (_, index) => block(`inserted-${index}`, "action", `Revision ${index}`));
  const revised = document([...originalBlocks.slice(0, 27), ...inserted, ...originalBlocks.slice(27)], { ...emptyWorkspace(), productionDraftLabel: "Blue Pages" });
  const pages = productionPages(revised, lock, [blueRevision(inserted.map((item) => item.id))]);
  assert.deepEqual(pages.map((page) => page.label), ["1", "1A", "2"]);
  assert.deepEqual(pages.map((page) => page.locked), [true, false, true]);
  assert.equal(pages[1].color, "Blue");
  assert.deepEqual(revisionExportMetadata(revised, [blueRevision(inserted.map((item) => item.id))], lock).lockedPages, ["1", "2"]);
});

test("production reports emit strips, sequential one-lines, and DOOD-like cast days while excluding omitted scenes", () => {
  const script = document([
    block("scene-1", "scene_heading", "INT. HOUSE - DAY", { Number: "10A" }),
    block("mara-1", "character", "MARA"),
    block("line-1", "dialogue", "One."),
    block("scene-2", "scene_heading", "EXT. ROAD - NIGHT"),
    block("mara-2", "character", "MARA"),
    block("line-2", "dialogue", "Two."),
    block("june-2", "character", "JUNE"),
    block("line-3", "dialogue", "Also two."),
    block("scene-3", "scene_heading", "INT. OFFICE - DAY"),
    block("mara-3", "character", "MARA"),
    block("line-4", "dialogue", "Three."),
    block("scene-4", "scene_heading", "EXT. FIELD - DUSK"),
    block("eli-4", "character", "ELI"),
    block("line-5", "dialogue", "Omitted."),
  ]);
  const omitted = setSceneOmitted(script, "scene-4");
  assert.equal(script.workspace, undefined);
  assert.deepEqual(omitted.workspace?.omittedSceneIds, ["scene-4"]);

  const reports = productionReports(omitted, 1);
  assert.equal(reports.sceneStrips.length, 4);
  assert.equal(reports.sceneStrips[0].sceneNumber, "10A");
  assert.equal(reports.sceneStrips[3].omitted, true);
  assert.deepEqual(reports.oneLineSchedule.map((row) => row.day), [1, 2, 3]);
  assert.match(reports.oneLineSchedule[0].line, /^10A INT\. HOUSE - DAY — MARA — 1\/8$/);
  assert.equal(reports.castDays.some((cast) => cast.character === "ELI"), false);
  assert.deepEqual(reports.castDays.find((cast) => cast.character === "MARA")?.days.map((day) => day.status), ["SW", "W", "WF"]);
  assert.deepEqual(reports.castDays.find((cast) => cast.character === "JUNE")?.days, [{ day: 2, status: "SWF", sceneNumbers: ["2"] }]);
  assert.match(productionReportsCsv(reports, "schedule"), /"Day","Scene"/);
  assert.match(productionReportsCsv(reports, "cast-days"), /"MARA","3","1","SW"/);
  assert.match(buildCharacterSides(omitted).MARA, /One\./);
  assert.doesNotMatch(buildCharacterSides(omitted).MARA, /Omitted\./);
  assert.match(buildSceneSides(omitted)["scene-2"], /EXT\. ROAD - NIGHT/);
  assert.match(dialogueOnly(omitted), /JUNE\nAlso two\./);
  assert.match(revisionReportMarkdown([{
    revisionId: "revision-blue", label: "Blue Revision", color: "Blue", addedBlockIds: ["one"], editedBlockIds: [], removedBlockIds: [], changedSceneIds: ["scene-1"], revisedPages: ["1"], totalChanges: 1,
  }]), /Blue Revision \(Blue\)/);
});
