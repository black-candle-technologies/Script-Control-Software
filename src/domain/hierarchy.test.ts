import { test } from "node:test";
import assert from "node:assert/strict";

import { coreStructure, featureHierarchy, televisionHierarchy } from "./hierarchy.ts";

const ids = (levels: { id: string }[]) => levels.map((l) => l.id);

test("core structure keeps Act → Sequence → Scene → Beat distinct and ordered", () => {
  assert.deepEqual(ids(coreStructure), ["act", "sequence", "scene", "beat"]);
});

test("feature hierarchy is Project → Act → Sequence → Scene → Beat", () => {
  assert.deepEqual(ids(featureHierarchy), ["project", "act", "sequence", "scene", "beat"]);
});

test("television hierarchy adds Show → Season → Episode above the core structure", () => {
  assert.deepEqual(ids(televisionHierarchy), [
    "show",
    "season",
    "episode",
    "act",
    "sequence",
    "scene",
    "beat",
  ]);
});

test("both project types share the same core structure", () => {
  assert.deepEqual(ids(featureHierarchy).slice(-4), ids(televisionHierarchy).slice(-4));
});

test("every level has a label and a description", () => {
  for (const level of [...featureHierarchy, ...televisionHierarchy]) {
    assert.ok(level.label.length > 0, `${level.id} needs a label`);
    assert.ok(level.description.length > 0, `${level.id} needs a description`);
  }
});
