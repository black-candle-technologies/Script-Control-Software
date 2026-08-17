import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  applySessionMutation,
  createMutationEnvelope,
  createSessionCoordinatorState,
  deriveSessionMutation,
  type ProjectSession,
  type AcceptedSessionMutation,
  type SessionMutation,
} from "../domain/index.ts";
import {
  bringAllWorkspaceWindowsToFront,
  completeCoordinatedSave,
  confirmCloseWorkspaceWindow,
  createWorkspaceWindow,
  focusWorkspaceWindow,
  getCoordinatorSnapshot,
  leaveWorkspaceProject,
  listWorkspaceWindows,
  listenForWindowCloseRequests,
  listenForSessionRevisions,
  listenForWindowRegistry,
  nativeMutationFailureMessage,
  registerCoordinatedSession,
  registerWorkspaceWindow,
  requestCloseWorkspaceWindow,
  requestCoordinatedSave,
  resetWorkspaceWindowPlacement,
  submitNativeMutation,
  type WindowRegistrySnapshot,
  type CloseDisposition,
  type SaveIntent,
  type SaveKind,
  type SaveCompletionResult,
  type CoordinatorSnapshot,
} from "../services/nativeWorkspaceService.ts";
import { nativeWorkspaceAvailable, parseWorkspaceBootstrap, type WorkspaceBootstrapIdentity } from "../services/workspaceIdentity.ts";
import {
  acceptedMutationsAfterRevision,
  captureAuthoritativeSaveSnapshot,
  rememberAuthoritativeSaveCapture,
  replayPendingSessionMutations,
  saveCaptureMatchesIntent,
  submissionAuthorityAction,
  type AuthoritativeSaveCapture,
} from "./coordinatedSessionAuthority.ts";

export interface CoordinatedSaveContext {
  projectId: string;
  sessionId: string;
  revision: number;
  authoritative: true;
}

export interface CoordinatedAuthorityCapture {
  session: ProjectSession;
  revision: number;
}

type CoordinatedSaveHandler = (
  session: ProjectSession,
  context: CoordinatedSaveContext,
) => boolean | Promise<boolean>;

interface CoordinatedSaveWork {
  capture?: AuthoritativeSaveCapture;
  handler: CoordinatedSaveHandler;
}

export interface CoordinatedSessionMeta {
  native: boolean;
  ready: boolean;
  revision: number;
  identity: WorkspaceBootstrapIdentity;
  windows?: WindowRegistrySnapshot;
  closeRequest?: CloseDisposition;
  isLeader: boolean;
  error?: string;
  createWindow: (slotId?: string) => Promise<void>;
  focusWindow: (windowId: string) => Promise<void>;
  bringAllToFront: () => Promise<void>;
  resetPlacement: () => Promise<void>;
  closeWindow: () => Promise<"secondary" | "promote-leader" | "final-window" | undefined>;
  leaveProject: (allowFinalWindow?: boolean) => Promise<void>;
  confirmFinalClose: (allow: boolean) => Promise<void>;
  saveRecovery: (save: (session: ProjectSession, context: CoordinatedSaveContext) => boolean) => Promise<boolean>;
  savePortable: (save: (session: ProjectSession, context: CoordinatedSaveContext) => Promise<boolean>) => Promise<boolean>;
  flushMutations: () => Promise<CoordinatedAuthorityCapture>;
}

export interface CoordinatedSessionValue {
  session: ProjectSession;
  setSession: Dispatch<SetStateAction<ProjectSession>>;
  mutateSession: (payload: SessionMutation) => void;
  meta: CoordinatedSessionMeta;
}

export function useCoordinatedSession(initialSession: ProjectSession): CoordinatedSessionValue {
  const native = nativeWorkspaceAvailable();
  const identity = useRef(createIdentity(initialSession.projectId)).current;
  const [session, setReactSession] = useState(initialSession);
  const sessionRef = useRef(initialSession);
  const [ready, setReady] = useState(!native);
  const readyRef = useRef(!native);
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const [windows, setWindows] = useState<WindowRegistrySnapshot>();
  const [closeRequest, setCloseRequest] = useState<CloseDisposition>();
  const [error, setError] = useState<string>();
  const pending = useRef<SessionMutation[]>([]);
  const submitTail = useRef<Promise<void>>(Promise.resolve());
  const activeSubmissions = useRef(0);
  const finalAuthorityRefreshRequired = useRef(false);
  const saveControlTail = useRef<Promise<void>>(Promise.resolve());
  const authoritativeSaveCaptures = useRef(new Map<number, AuthoritativeSaveCapture>());
  const saveWork = useRef(new Map<string, CoordinatedSaveWork>());
  const saveWaiters = useRef(new Map<string, ((success: boolean) => void)[]>());
  const completedSaveResults = useRef(new Map<string, boolean>());
  const mounted = useRef(true);

  const installSnapshot = useCallback((snapshot: CoordinatorSnapshot) => {
    const authoritative = captureAuthoritativeSaveSnapshot(snapshot, identity);
    sessionRef.current = authoritative.session;
    revisionRef.current = authoritative.revision;
    if (mounted.current) {
      setReactSession(authoritative.session);
      setRevision(authoritative.revision);
    }
  }, [identity]);

  const readAuthoritativeSaveCapture = useCallback(async (): Promise<AuthoritativeSaveCapture> => {
    const snapshot = await getCoordinatorSnapshot(identity.projectId, identity.sessionId);
    const capture = captureAuthoritativeSaveSnapshot(snapshot, identity);
    rememberAuthoritativeSaveCapture(authoritativeSaveCaptures.current, capture);
    return capture;
  }, [identity]);

  const refreshSnapshot = useCallback(async (minimumRevision = 0): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snapshot = await getCoordinatorSnapshot(identity.projectId, identity.sessionId);
      const requiredRevision = Math.max(minimumRevision, revisionRef.current);
      if (snapshot.revision < requiredRevision) continue;
      installSnapshot(snapshot);
      return;
    }
    throw new Error("The authoritative coordinator snapshot remained behind the observed revision.");
  }, [identity, installSnapshot]);

  const enqueueSaveControl = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const result = saveControlTail.current.then(task);
    saveControlTail.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const drainSubmitTail = useCallback(async (): Promise<void> => {
    let observed: Promise<void>;
    do {
      observed = submitTail.current;
      await observed;
    } while (observed !== submitTail.current);
  }, []);

  const applyRemote = useCallback(async (accepted: AcceptedSessionMutation) => {
    if (accepted.newRevision <= revisionRef.current) return;
    if (activeSubmissions.current > 0) finalAuthorityRefreshRequired.current = true;
    if (accepted.newRevision !== revisionRef.current + 1) {
      await refreshSnapshot(accepted.newRevision);
      if (activeSubmissions.current > 0) finalAuthorityRefreshRequired.current = true;
      return;
    }
    try {
      const next = applySessionMutation(sessionRef.current, accepted.envelope.payload);
      sessionRef.current = next;
      revisionRef.current = accepted.newRevision;
      if (mounted.current) {
        setReactSession(next);
        setRevision(accepted.newRevision);
      }
    } catch {
      await refreshSnapshot();
      if (activeSubmissions.current > 0) finalAuthorityRefreshRequired.current = true;
    }
  }, [refreshSnapshot]);

  const submitPayload = useCallback((payload: SessionMutation) => {
    if (!native) return;
    if (!readyRef.current) {
      pending.current.push(payload);
      finalAuthorityRefreshRequired.current = true;
      return;
    }
    activeSubmissions.current += 1;
    submitTail.current = submitTail.current.then(async () => {
      try {
        const coordinator = createSessionCoordinatorState(sessionRef.current, { sessionId: identity.sessionId, revision: revisionRef.current });
        const envelope = createMutationEnvelope(coordinator, identity.windowId, payload, { baseRevision: revisionRef.current });
        try {
          const result = await submitNativeMutation(envelope);
          const authorityAction = submissionAuthorityAction(
            result.disposition,
            result.revision,
            revisionRef.current,
          );
          if (authorityAction === "advance") {
            revisionRef.current = Math.max(revisionRef.current, result.revision);
            if (mounted.current) setRevision(revisionRef.current);
          } else if (authorityAction === "refresh") {
            await refreshSnapshot(result.revision);
            if (activeSubmissions.current > 1) finalAuthorityRefreshRequired.current = true;
          } else {
            const failure = nativeMutationFailureMessage(result)
              ?? "The native coordinator rejected the mutation.";
            if (result.snapshot && result.snapshot.revision >= revisionRef.current) {
              installSnapshot(result.snapshot);
            } else {
              await refreshSnapshot(Math.max(result.revision, revisionRef.current));
            }
            if (activeSubmissions.current > 1) finalAuthorityRefreshRequired.current = true;
            if (mounted.current) setError(failure);
          }
        } catch (cause) {
          if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
          await refreshSnapshot().catch(() => undefined);
          if (activeSubmissions.current > 1) finalAuthorityRefreshRequired.current = true;
        }
      } finally {
        activeSubmissions.current -= 1;
        if (
          activeSubmissions.current === 0
          && readyRef.current
          && finalAuthorityRefreshRequired.current
        ) {
          finalAuthorityRefreshRequired.current = false;
          try {
            await refreshSnapshot();
          } catch (cause) {
            if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
          }
          if (activeSubmissions.current > 0) finalAuthorityRefreshRequired.current = true;
        }
      }
    });
  }, [identity, installSnapshot, native, refreshSnapshot]);

  const setSession: Dispatch<SetStateAction<ProjectSession>> = useCallback((action) => {
    const before = sessionRef.current;
    const next = typeof action === "function" ? action(before) : action;
    if (next === before) return;
    sessionRef.current = next;
    setReactSession(next);
    submitPayload(deriveSessionMutation(before, next));
  }, [submitPayload]);
  const mutateSession = useCallback((payload: SessionMutation) => {
    const next = applySessionMutation(sessionRef.current, payload);
    sessionRef.current = next;
    setReactSession(next);
    submitPayload(payload);
  }, [submitPayload]);

  useEffect(() => {
    mounted.current = true;
    if (!native) return () => { mounted.current = false; };
    let stopped = false;
    let bootstrapping = true;
    const bufferedRevisions: AcceptedSessionMutation[] = [];
    const unlisten: (() => void)[] = [];
    const queueRemoteRevision = (accepted: AcceptedSessionMutation) => {
      if (
        accepted.envelope.projectId !== identity.projectId
        || accepted.envelope.sessionId !== identity.sessionId
      ) return;
      const remote = submitTail.current.then(() => applyRemote(accepted));
      submitTail.current = remote.catch(async (cause) => {
        if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
        await refreshSnapshot(accepted.newRevision).catch(() => undefined);
      });
    };
    void (async () => {
      try {
        const stopRevisions = await listenForSessionRevisions((accepted) => {
          if (stopped) return;
          if (bootstrapping) bufferedRevisions.push(accepted);
          else queueRemoteRevision(accepted);
        });
        if (stopped) { stopRevisions(); return; }
        unlisten.push(stopRevisions);
        const stopWindows = await listenForWindowRegistry((registry) => {
          if (registry.projectId === identity.projectId && !stopped) setWindows(registry);
        });
        if (stopped) { stopWindows(); return; }
        unlisten.push(stopWindows);
        const stopCloseRequests = await listenForWindowCloseRequests((request) => {
          if (request.windowId === identity.windowId && !stopped) setCloseRequest(request);
        });
        if (stopped) { stopCloseRequests(); return; }
        unlisten.push(stopCloseRequests);

        let snapshot: CoordinatorSnapshot;
        if (!parseWorkspaceBootstrap(globalThis.location.search)) {
          const registry = await registerWorkspaceWindow(identity.projectId, { windowId: identity.windowId, slotId: identity.slotId });
          if (!stopped) setWindows(registry);
          snapshot = await registerCoordinatedSession(identity.sessionId, initialSession);
        } else {
          snapshot = await getCoordinatorSnapshot(identity.projectId, identity.sessionId);
          const registry = await listWorkspaceWindows(identity.projectId);
          if (!stopped) setWindows(registry);
        }
        if (stopped) return;
        installSnapshot(snapshot);
        bootstrapping = false;
        acceptedMutationsAfterRevision(bufferedRevisions, snapshot.revision)
          .forEach(queueRemoteRevision);
        await submitTail.current;
        if (!stopped) {
          const queued = pending.current.splice(0);
          if (queued.length) {
            const replayed = replayPendingSessionMutations(sessionRef.current, queued);
            sessionRef.current = replayed;
            setReactSession(replayed);
          }
          readyRef.current = true;
          setReady(true);
          queued.forEach(submitPayload);
        }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      stopped = true;
      mounted.current = false;
      unlisten.forEach((stop) => stop());
    };
  }, [applyRemote, identity, initialSession, installSnapshot, native, refreshSnapshot, submitPayload]);

  const isLeader = windows?.windows.find((window) => window.windowId === identity.windowId)?.isLeader ?? !native;
  const createWindow = useCallback(async (slotId = `window-${crypto.randomUUID().slice(0, 8)}`) => {
    await createWorkspaceWindow({ projectId: identity.projectId, sessionId: identity.sessionId, slotId });
  }, [identity]);
  const focusWindow = useCallback(async (windowId: string) => focusWorkspaceWindow(identity.projectId, windowId), [identity.projectId]);
  const bringAllToFront = useCallback(async () => bringAllWorkspaceWindowsToFront(identity.projectId), [identity.projectId]);
  const resetPlacement = useCallback(async () => resetWorkspaceWindowPlacement(identity.projectId, identity.windowId), [identity]);
  const closeWindow = useCallback(async () => {
    await drainSubmitTail();
    const disposition = await requestCloseWorkspaceWindow();
    if (disposition.kind !== "final-window") await confirmCloseWorkspaceWindow(true);
    return disposition.kind;
  }, [drainSubmitTail]);
  const leaveProject = useCallback(async (allowFinalWindow = true) => {
    if (!native) return;
    await drainSubmitTail();
    await leaveWorkspaceProject(allowFinalWindow);
  }, [drainSubmitTail, native]);
  const flushMutations = useCallback(async (): Promise<CoordinatedAuthorityCapture> => {
    await drainSubmitTail();
    if (!native) {
      return { session: structuredClone(sessionRef.current), revision: revisionRef.current };
    }
    const capture = await readAuthoritativeSaveCapture();
    return { session: capture.session, revision: capture.revision };
  }, [drainSubmitTail, native, readAuthoritativeSaveCapture]);
  const confirmFinalClose = useCallback(async (allow: boolean) => {
    setCloseRequest(undefined);
    if (allow) await confirmCloseWorkspaceWindow(true);
  }, []);
  const coordinatedSave = useCallback(async (
    kind: SaveKind,
    save: CoordinatedSaveHandler,
  ): Promise<boolean> => {
    if (!native) {
      return save(sessionRef.current, {
        projectId: identity.projectId,
        sessionId: identity.sessionId,
        revision: revisionRef.current,
        authoritative: true,
      });
    }
    if (!isLeader || !ready) return kind === "recovery";
    const result = await enqueueSaveControl(async () => {
      await drainSubmitTail();
      const requestedCapture = await readAuthoritativeSaveCapture();
      const requested = await requestCoordinatedSave(
        identity.projectId,
        identity.sessionId,
        requestedCapture.revision,
        kind,
      );
      if (requested.disposition === "already-covered") return requested;

      let intentCapture = authoritativeSaveCaptures.current.get(requested.intent.revision);
      if (!saveCaptureMatchesIntent(intentCapture, requested.intent)) {
        const latestCapture = await readAuthoritativeSaveCapture();
        if (saveCaptureMatchesIntent(latestCapture, requested.intent)) intentCapture = latestCapture;
      }
      saveWork.current.set(requested.intent.intentId, {
        ...(saveCaptureMatchesIntent(intentCapture, requested.intent) ? { capture: intentCapture } : {}),
        handler: save,
      });
      if (!saveCaptureMatchesIntent(intentCapture, requested.intent) && mounted.current) {
        setError("The coordinated save intent has no matching authoritative snapshot; it will not write optimistic state.");
      }
      return requested;
    });
    if (result.disposition === "already-covered") return true;
    const waitForResult = (intentId: string) => {
      const completed = completedSaveResults.current.get(intentId);
      if (completed !== undefined) {
        completedSaveResults.current.delete(intentId);
        return Promise.resolve(completed);
      }
      return new Promise<boolean>((resolve) => {
        const waiting = saveWaiters.current.get(intentId) ?? [];
        waiting.push(resolve);
        saveWaiters.current.set(intentId, waiting);
      });
    };
    const settle = (intentId: string, success: boolean) => {
      const waiting = saveWaiters.current.get(intentId);
      if (waiting?.length) {
        saveWaiters.current.delete(intentId);
        waiting.forEach((resolve) => resolve(success));
      } else {
        completedSaveResults.current.set(intentId, success);
      }
    };
    const completion = waitForResult(result.intent.intentId);
    if (result.disposition === "start") {
      void (async () => {
        let intent: SaveIntent | null = result.intent;
        while (intent) {
          const activeIntent: SaveIntent = intent;
          const work = saveWork.current.get(activeIntent.intentId);
          let success = false;
          if (!work || !saveCaptureMatchesIntent(work.capture, activeIntent)) {
            if (mounted.current) {
              setError("A coordinated save was skipped because its authoritative snapshot was unavailable.");
            }
          } else {
            try {
              success = await work.handler(work.capture.session, {
                projectId: work.capture.projectId,
                sessionId: work.capture.sessionId,
                revision: work.capture.revision,
                authoritative: true,
              });
            } catch (cause) {
              if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
            }
          }
          try {
            const next: SaveCompletionResult = await enqueueSaveControl<SaveCompletionResult>(() => completeCoordinatedSave(
              identity.projectId,
              identity.sessionId,
              activeIntent.intentId,
              success,
            ));
            saveWork.current.delete(activeIntent.intentId);
            settle(activeIntent.intentId, success);
            intent = next.next;
          } catch (cause) {
            saveWork.current.delete(activeIntent.intentId);
            settle(activeIntent.intentId, false);
            if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
            intent = null;
          }
        }
      })();
    }
    return completion;
  }, [drainSubmitTail, enqueueSaveControl, identity, isLeader, native, readAuthoritativeSaveCapture, ready]);
  const saveRecovery = useCallback(
    (save: (current: ProjectSession, context: CoordinatedSaveContext) => boolean) => coordinatedSave("recovery", save),
    [coordinatedSave],
  );
  const savePortable = useCallback(
    (save: (current: ProjectSession, context: CoordinatedSaveContext) => Promise<boolean>) => coordinatedSave("portable", save),
    [coordinatedSave],
  );

  return {
    session,
    setSession,
    mutateSession,
    meta: { native, ready, revision, identity, windows, ...(closeRequest ? { closeRequest } : {}), isLeader, ...(error ? { error } : {}), createWindow, focusWindow, bringAllToFront, resetPlacement, closeWindow, leaveProject, confirmFinalClose, saveRecovery, savePortable, flushMutations },
  };
}

function createIdentity(projectId: string): WorkspaceBootstrapIdentity {
  return parseWorkspaceBootstrap(globalThis.location?.search ?? "") ?? {
    projectId,
    sessionId: `session-${crypto.randomUUID()}`,
    windowId: `window-${crypto.randomUUID()}`,
    slotId: "primary",
  };
}
