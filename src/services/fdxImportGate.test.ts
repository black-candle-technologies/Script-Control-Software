import assert from "node:assert/strict";
import test from "node:test";

import { passesBeforeReplace } from "./fdxImportGate.ts";

test("FDX replacement proceeds without a beforeReplace callback", async () => {
  assert.equal(await passesBeforeReplace(), true);
});

test("FDX replacement awaits and honors a legitimate beforeReplace callback", async () => {
  let calls = 0;
  const allow = async () => {
    calls += 1;
    return true;
  };

  assert.equal(await passesBeforeReplace(allow), true);
  assert.equal(calls, 1);
  assert.equal(await passesBeforeReplace(async () => false), false);
});

test("FDX replacement ignores a malformed non-function beforeReplace value", async () => {
  const clickEventLikeValue = { type: "click", currentTarget: {} };

  await assert.doesNotReject(() => passesBeforeReplace(clickEventLikeValue));
  assert.equal(await passesBeforeReplace(clickEventLikeValue), true);
});
