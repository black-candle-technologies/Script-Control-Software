import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSession } from "./projectWorkspace.ts";
import { emptyDocument } from "./screenplay.ts";
import { mergePortableSaveMetadata } from "./portableSave.ts";

test("a completed older save updates file metadata without reverting a later live edit", () => {
  const capturedForSave = createProjectSession(emptyDocument("Save race"));
  const saved = {
    ...structuredClone(capturedForSave),
    projectPath: "C:/projects/show/scs.project.json",
    updatedAt: "2026-08-17T12:00:00.000Z",
  };
  const live = structuredClone(capturedForSave);
  live.documents[0].blocks[0].text = "REMOTE EDIT ACCEPTED WHILE THE SAVE DIALOG WAS OPEN";

  const merged = mergePortableSaveMetadata(live, saved);
  assert.equal(merged.documents[0].blocks[0].text, "REMOTE EDIT ACCEPTED WHILE THE SAVE DIALOG WAS OPEN");
  assert.equal(merged.projectPath, saved.projectPath);
  assert.equal(merged.updatedAt, saved.updatedAt);
});

test("deferred portable-save metadata merges into the latest multi-document live session", async () => {
  const capturedForSave = createProjectSession(emptyDocument("Captured before save"));
  let completeWrite!: (saved: typeof capturedForSave) => void;
  const deferredWrite = new Promise<typeof capturedForSave>((resolve) => { completeWrite = resolve; });
  let live = structuredClone(capturedForSave);
  const mergeWhenComplete = deferredWrite.then((saved) => {
    live = mergePortableSaveMetadata(live, saved);
  });

  const laterDocument = emptyDocument("Added while saving");
  laterDocument.blocks[0].text = "INT. LATER LIVE EDIT - DAY";
  live = {
    ...live,
    name: "Renamed while saving",
    documents: [
      { ...live.documents[0], blocks: [{ ...live.documents[0].blocks[0], text: "INT. LIVE EDIT - NIGHT" }] },
      laterDocument,
    ],
    activeDocumentId: laterDocument.id,
  };
  const saved = {
    ...structuredClone(capturedForSave),
    projectPath: "C:/projects/deferred/scs.project.json",
    updatedAt: "2026-08-17T13:00:00.000Z",
  };
  completeWrite(saved);
  await mergeWhenComplete;

  assert.equal(live.name, "Renamed while saving");
  assert.equal(live.documents.length, 2);
  assert.equal(live.documents[0].blocks[0].text, "INT. LIVE EDIT - NIGHT");
  assert.equal(live.documents[1].blocks[0].text, "INT. LATER LIVE EDIT - DAY");
  assert.equal(live.activeDocumentId, laterDocument.id);
  assert.equal(live.projectPath, saved.projectPath);
  assert.equal(live.updatedAt, saved.updatedAt);
});

test("portable metadata from another project is rejected", () => {
  const current = createProjectSession(emptyDocument("Project one"));
  const saved = { ...structuredClone(current), projectId: "another-project" };
  assert.throws(() => mergePortableSaveMetadata(current, saved), /another project/i);
});
