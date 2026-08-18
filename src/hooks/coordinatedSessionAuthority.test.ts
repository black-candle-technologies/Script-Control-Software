import assert from "node:assert/strict";
import test from "node:test";

import { createProjectSession, emptyDocument } from "../domain/index.ts";
import type { CoordinatorSnapshot, SaveIntent } from "../services/nativeWorkspaceService.ts";
import {
  acceptedMutationsAfterRevision,
  captureAuthoritativeSaveSnapshot,
  rememberAuthoritativeSaveCapture,
  replayPendingSessionMutations,
  saveCaptureMatchesIntent,
  submissionAuthorityAction,
} from "./coordinatedSessionAuthority.ts";

test("reconciled and ahead-duplicate submissions require authoritative refresh", () => {
  assert.equal(submissionAuthorityAction("accepted", 5, 4), "advance");
  assert.equal(submissionAuthorityAction("reconciled", 5, 4), "refresh");
  assert.equal(submissionAuthorityAction("duplicate", 5, 4), "refresh");
  assert.equal(submissionAuthorityAction("duplicate", 4, 4), "advance");
  assert.equal(submissionAuthorityAction("rejected", 4, 4), "rollback");
  assert.throws(() => submissionAuthorityAction("accepted", -1, 0), /revision/i);
});

test("coordinated saves accept only an exact authoritative intent snapshot", () => {
  const session = createProjectSession(emptyDocument("Authority Test"));
  const snapshot: CoordinatorSnapshot = {
    projectId: session.projectId,
    sessionId: "session-test",
    revision: 7,
    session,
    resourceRevisions: {},
  };
  const capture = captureAuthoritativeSaveSnapshot(snapshot, {
    projectId: session.projectId,
    sessionId: "session-test",
  });
  const intent: SaveIntent = {
    intentId: "save-test",
    projectId: session.projectId,
    sessionId: "session-test",
    revision: 7,
    kind: "portable",
  };
  assert.equal(saveCaptureMatchesIntent(capture, intent), true);
  assert.equal(saveCaptureMatchesIntent(capture, { ...intent, revision: 8 }), false);
  assert.throws(
    () => captureAuthoritativeSaveSnapshot({ ...snapshot, sessionId: "session-other" }, {
      projectId: session.projectId,
      sessionId: "session-test",
    }),
    /did not match/i,
  );
});

test("authoritative save captures remain bounded by revision", () => {
  const session = createProjectSession(emptyDocument("Capture Test"));
  const captures = new Map<number, ReturnType<typeof captureAuthoritativeSaveSnapshot>>();
  for (let revision = 1; revision <= 4; revision += 1) {
    rememberAuthoritativeSaveCapture(captures, {
      projectId: session.projectId,
      sessionId: "session-test",
      revision,
      session,
    }, 2);
  }
  assert.deepEqual([...captures.keys()], [3, 4]);
});

test("bootstrap catch-up orders and deduplicates only unseen accepted revisions", () => {
  const session = createProjectSession(emptyDocument("Catch-up Test"));
  const event = (newRevision: number) => ({
    newRevision,
    conflictKeys: [],
    envelope: {
      protocolVersion: 1,
      projectId: session.projectId,
      sessionId: "session-test",
      originWindowId: "window-other",
      actorId: session.workspace.currentUserId,
      actionId: `action-${newRevision}`,
      baseRevision: newRevision - 1,
      issuedAt: "2026-08-17T00:00:00.000Z",
      payload: { kind: "set-project-name" as const, name: `Revision ${newRevision}` },
    },
  });
  assert.deepEqual(
    acceptedMutationsAfterRevision([event(4), event(3), event(4), event(2)], 2)
      .map((accepted) => accepted.newRevision),
    [3, 4],
  );
});

test("pre-ready optimistic mutations replay over the installed authority in order", () => {
  const session = createProjectSession(emptyDocument("Replay Test"));
  const replayed = replayPendingSessionMutations(session, [
    { kind: "set-project-name", name: "First" },
    { kind: "set-project-name", name: "Second" },
  ]);
  assert.equal(replayed.name, "Second");
  assert.equal(session.name, "Replay Test");
});
