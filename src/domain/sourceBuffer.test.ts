import assert from "node:assert/strict";
import test from "node:test";
import { reconcileFountainSourceBuffer } from "./sourceBuffer.ts";

test("an unchanged Fountain buffer rebases onto an accepted remote edit", () => {
  const result = reconcileFountainSourceBuffer({
    documentId: "doc-1",
    baseText: "INT. ROOM - DAY\n\nOriginal.",
    localText: "INT. ROOM - DAY\n\nOriginal.",
    acceptedText: "INT. ROOM - DAY\n\nREMOTE EDIT",
    acceptedRevision: 12,
  });
  assert.deepEqual(result, {
    kind: "rebased",
    documentId: "doc-1",
    baseText: "INT. ROOM - DAY\n\nREMOTE EDIT",
    localText: "INT. ROOM - DAY\n\nREMOTE EDIT",
  });
});

test("independent local and accepted Fountain edits conflict instead of overwriting", () => {
  const result = reconcileFountainSourceBuffer({
    documentId: "doc-1",
    baseText: "INT. ROOM - DAY\n\nOriginal.",
    localText: "INT. ROOM - DAY\n\nLOCAL EDIT",
    acceptedText: "INT. ROOM - DAY\n\nREMOTE EDIT",
    acceptedRevision: 12,
  });
  assert.equal(result.kind, "conflict");
  if (result.kind !== "conflict") return;
  assert.equal(result.localText, "INT. ROOM - DAY\n\nLOCAL EDIT");
  assert.equal(result.acceptedText, "INT. ROOM - DAY\n\nREMOTE EDIT");
  assert.equal(result.acceptedRevision, 12);
});

test("two windows preserve the accepted draft and the independently edited source buffer", () => {
  const baseText = "INT. ROOM - DAY\n\nOriginal.";
  const acceptedByWindowB = "INT. ROOM - DAY\n\nREMOTE EDIT";
  const untouchedWindowA = reconcileFountainSourceBuffer({
    documentId: "doc-1",
    baseText,
    localText: baseText,
    acceptedText: acceptedByWindowB,
    acceptedRevision: 2,
  });
  assert.equal(untouchedWindowA.kind, "rebased");
  assert.equal(untouchedWindowA.localText, acceptedByWindowB);

  const editedWindowA = reconcileFountainSourceBuffer({
    documentId: "doc-1",
    baseText,
    localText: "INT. ROOM - DAY\n\nLOCAL EDIT",
    acceptedText: acceptedByWindowB,
    acceptedRevision: 2,
  });
  assert.equal(editedWindowA.kind, "conflict");
  if (editedWindowA.kind !== "conflict") return;
  assert.equal(editedWindowA.localText, "INT. ROOM - DAY\n\nLOCAL EDIT");
  assert.equal(editedWindowA.acceptedText, acceptedByWindowB);
});
