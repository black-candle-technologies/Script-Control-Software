import assert from "node:assert/strict";
import test from "node:test";

import {
  nativeMutationFailureMessage,
  type NativeMutationResult,
} from "./nativeWorkspaceService.ts";

function result(overrides: Partial<NativeMutationResult>): NativeMutationResult {
  return {
    disposition: "rejected",
    revision: 3,
    accepted: null,
    reason: "stale-conflict",
    message: "The edited resource changed in another window.",
    snapshot: null,
    ...overrides,
  };
}

test("native mutation failures surface validated coordinator reasons and messages", () => {
  assert.equal(
    nativeMutationFailureMessage(result({})),
    "The native coordinator rejected the mutation (stale-conflict): The edited resource changed in another window.",
  );
  assert.equal(
    nativeMutationFailureMessage(result({
      disposition: "resync",
      reason: "history-gap",
      message: "The mutation base revision is outside retained history.",
    })),
    "The native coordinator required a resync for the mutation (history-gap): The mutation base revision is outside retained history.",
  );
  assert.equal(nativeMutationFailureMessage(result({ disposition: "accepted" })), null);
});

test("malformed native rejection details are not reflected into UI errors", () => {
  const malformed = result({
    reason: "not-a-rust-reason" as NativeMutationResult["reason"],
    message: "unsafe\nmessage",
  });
  assert.equal(
    nativeMutationFailureMessage(malformed),
    "The native coordinator rejected the mutation without a valid reason.",
  );
});
