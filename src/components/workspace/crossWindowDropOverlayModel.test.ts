import assert from "node:assert/strict";
import test from "node:test";

import {
  nativeDropPlacementOptions,
  sameNativeDropPlacement,
} from "./crossWindowDropOverlayModel.ts";

test("document destinations expose every insertion index including the end", () => {
  const options = nativeDropPlacementOptions({ kind: "document-tab", documentId: "doc-1" }, 2, []);
  assert.deepEqual(options.map((option) => option.value), [
    { kind: "document-tabs", index: 0 },
    { kind: "document-tabs", index: 1 },
    { kind: "document-tabs", index: 2 },
  ]);
  assert.equal(options[2].label, "At end of screenplay tabs");
});

test("panel destinations deduplicate dock groups and always retain a floating fallback", () => {
  const options = nativeDropPlacementOptions(
    { kind: "workspace-panel", panelId: "reference" },
    0,
    ["main-tabs", " main-tabs ", ""],
  );
  assert.equal(options.length, 6);
  assert.deepEqual(options.at(-1)?.value, { kind: "floating-layer" });
  assert.equal(sameNativeDropPlacement(
    { kind: "dock-group", groupId: "main-tabs", edge: "right" },
    { kind: "dock-group", groupId: "main-tabs", edge: "right" },
  ), true);
  assert.equal(sameNativeDropPlacement(
    { kind: "document-tabs", index: 0 },
    { kind: "document-tabs", index: 1 },
  ), false);
});
