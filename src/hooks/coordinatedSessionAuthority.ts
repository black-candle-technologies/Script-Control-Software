import {
  applySessionMutation,
  normalizeProjectSession,
  type AcceptedSessionMutation,
  type ProjectSession,
  type SessionMutation,
} from "../domain/index.ts";
import type {
  CoordinatorSnapshot,
  NativeMutationDisposition,
  SaveIntent,
} from "../services/nativeWorkspaceService.ts";

export type SubmissionAuthorityAction = "advance" | "refresh" | "rollback";

export interface AuthoritativeSaveCapture {
  projectId: string;
  sessionId: string;
  revision: number;
  session: ProjectSession;
}

export function submissionAuthorityAction(
  disposition: NativeMutationDisposition,
  resultRevision: number,
  localRevision: number,
): SubmissionAuthorityAction {
  if (!validRevision(resultRevision) || !validRevision(localRevision)) {
    throw new Error("The native mutation revision is invalid.");
  }
  if (disposition === "reconciled") return "refresh";
  if (disposition === "duplicate") return resultRevision > localRevision ? "refresh" : "advance";
  if (disposition === "accepted") return "advance";
  return "rollback";
}

export function captureAuthoritativeSaveSnapshot(
  snapshot: CoordinatorSnapshot,
  expected: { projectId: string; sessionId: string },
): AuthoritativeSaveCapture {
  if (
    snapshot.projectId !== expected.projectId
    || snapshot.sessionId !== expected.sessionId
    || !validRevision(snapshot.revision)
    || snapshot.session.projectId !== expected.projectId
  ) {
    throw new Error("The coordinated save snapshot did not match its live project session.");
  }
  return {
    projectId: snapshot.projectId,
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    session: normalizeProjectSession(snapshot.session),
  };
}

export function saveCaptureMatchesIntent(
  capture: AuthoritativeSaveCapture | undefined,
  intent: SaveIntent,
): capture is AuthoritativeSaveCapture {
  return Boolean(
    capture
    && capture.projectId === intent.projectId
    && capture.sessionId === intent.sessionId
    && capture.revision === intent.revision
    && capture.session.projectId === intent.projectId,
  );
}

export function rememberAuthoritativeSaveCapture(
  captures: Map<number, AuthoritativeSaveCapture>,
  capture: AuthoritativeSaveCapture,
  limit = 64,
): void {
  captures.delete(capture.revision);
  captures.set(capture.revision, capture);
  while (captures.size > limit) {
    const oldest = captures.keys().next().value;
    if (oldest === undefined) break;
    captures.delete(oldest);
  }
}

export function acceptedMutationsAfterRevision(
  events: readonly AcceptedSessionMutation[],
  installedRevision: number,
): AcceptedSessionMutation[] {
  const byRevision = new Map<number, AcceptedSessionMutation>();
  for (const event of events) {
    if (event.newRevision > installedRevision && !byRevision.has(event.newRevision)) {
      byRevision.set(event.newRevision, event);
    }
  }
  return [...byRevision.values()].sort((left, right) => left.newRevision - right.newRevision);
}

export function replayPendingSessionMutations(
  authoritative: ProjectSession,
  payloads: readonly SessionMutation[],
): ProjectSession {
  return payloads.reduce(
    (current, payload) => applySessionMutation(current, payload),
    authoritative,
  );
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
