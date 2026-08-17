import assert from "node:assert/strict";
import test from "node:test";
import { resolveScriptTarget, type ScriptTarget } from "./scriptTarget.ts";
import type { ScreenplayBlock } from "./screenplay.ts";

const blocks: ScreenplayBlock[] = [
  { id: "scene-1", type: "scene_heading", text: "INT. KITCHEN - NIGHT" },
  { id: "action-1", type: "action", text: "A knife falls. The knife spins." },
  { id: "scene-2", type: "scene_heading", text: "EXT. ROAD - DAY" },
  { id: "action-2", type: "action", text: "Another knife waits." },
];

const target = (patch: Partial<ScriptTarget> = {}): ScriptTarget => ({
  documentId: "document-1",
  blockId: "action-1",
  sceneId: "scene-1",
  startOffset: 2,
  endOffset: 7,
  matchedText: "knife",
  occurrence: 0,
  ...patch,
});

test("script targets resolve exact textarea offsets", () => {
  assert.deepEqual(resolveScriptTarget(target(), { id: "document-1", blocks }), {
    kind: "exact",
    blockId: "action-1",
    sceneId: "scene-1",
    startOffset: 2,
    endOffset: 7,
    matchedText: "knife",
    occurrence: 0,
  });
});

test("stale ranges relocate only to the requested occurrence in the original block", () => {
  const edited = blocks.map((block) => block.id === "action-1"
    ? { ...block, text: "Suddenly, A KNIFE falls. The knife spins." }
    : block);
  const second = resolveScriptTarget(target({ startOffset: 21, endOffset: 26, occurrence: 1 }), { id: "document-1", blocks: edited });
  assert.equal(second.kind, "relocated");
  if (second.kind === "relocated") {
    assert.equal(second.matchedText, "knife");
    assert.equal(edited[1].text.slice(second.startOffset, second.endOffset), "knife");
    assert.equal(second.startOffset, edited[1].text.lastIndexOf("knife"));
  }
});

test("changed text falls back to the original block and never another scene", () => {
  const edited = blocks.map((block) => block.id === "action-1" ? { ...block, text: "The blade is gone." } : block);
  assert.deepEqual(resolveScriptTarget(target(), { id: "document-1", blocks: edited }), {
    kind: "block",
    blockId: "action-1",
    sceneId: "scene-1",
    caretOffset: 2,
    reason: "text-changed",
  });
});

test("a missing block falls back to its original scene heading", () => {
  assert.deepEqual(resolveScriptTarget(target({ blockId: "missing", source: "object-continuity" }), { id: "document-1", blocks }), {
    kind: "scene",
    blockId: "scene-1",
    sceneId: "scene-1",
    caretOffset: 0,
    reason: "block-missing",
  });
});

test("a changed scene association still resolves the stable original block", () => {
  assert.equal(resolveScriptTarget(target({ sceneId: "scene-2" }), { id: "document-1", blocks }).kind, "exact");
});

test("targets without occurrence details safely focus the original block", () => {
  assert.deepEqual(resolveScriptTarget({
    documentId: "document-1",
    blockId: "action-1",
    sceneId: "scene-1",
    source: "other",
    reason: "Open the containing paragraph",
  }, { id: "document-1", blocks }), {
    kind: "block",
    blockId: "action-1",
    sceneId: "scene-1",
    caretOffset: 0,
    reason: "range-unavailable",
  });
});

test("document and exhausted block/scene fallbacks fail closed", () => {
  assert.deepEqual(resolveScriptTarget(target(), { id: "other-document", blocks }), { kind: "missing", reason: "document" });
  assert.deepEqual(resolveScriptTarget(target({ blockId: "missing", sceneId: undefined }), { id: "document-1", blocks }), { kind: "missing", reason: "block" });
  assert.deepEqual(resolveScriptTarget(target({ blockId: "missing", sceneId: "missing-scene" }), { id: "document-1", blocks }), { kind: "missing", reason: "scene" });
});
