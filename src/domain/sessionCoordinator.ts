import type { ProjectSession, ProjectSessionType, ProjectWorkspace } from "./projectWorkspace.ts";
import type { ScreenplayBlock, ScreenplayDocument } from "./screenplay.ts";
import type { VersionHistory } from "./versioning.ts";
import { hasPermission } from "./collaboration.ts";
import { removeProjectDocument } from "./documentTabs.ts";
import { deleteCustomLayout, saveCustomLayout, type AnyWorkspaceLayout } from "./workspaceLayouts.ts";

export type AtomicSessionMutation =
  | { kind: "set-project-name"; name: string }
  | { kind: "set-project-type"; projectType: ProjectSessionType }
  | { kind: "set-persistence-metadata"; projectPath: string; updatedAt: string }
  | { kind: "insert-document"; document: ScreenplayDocument; afterDocumentId?: string }
  | { kind: "remove-document"; documentId: string; recoverySnapshotId: string }
  | { kind: "replace-document"; documentId: string; document: ScreenplayDocument }
  | { kind: "insert-block"; documentId: string; block: ScreenplayBlock; beforeBlockId?: string }
  | { kind: "replace-block"; documentId: string; blockId: string; block: ScreenplayBlock; expectedFingerprint?: string }
  | { kind: "remove-block"; documentId: string; blockId: string; expectedFingerprint?: string }
  | { kind: "set-workspace"; workspace: ProjectWorkspace }
  | { kind: "upsert-layout"; layout: AnyWorkspaceLayout }
  | { kind: "delete-layout"; layoutId: string }
  | { kind: "set-version-history"; versionHistory: VersionHistory }
  | { kind: "replace-session"; session: ProjectSession };

export type SessionMutation = AtomicSessionMutation | { kind: "batch"; mutations: AtomicSessionMutation[] };

export interface SessionMutationEnvelope {
  protocolVersion: 1;
  projectId: string;
  sessionId: string;
  originWindowId: string;
  actorId: string;
  actionId: string;
  baseRevision: number;
  issuedAt: string;
  payload: SessionMutation;
}

export interface AcceptedSessionMutation {
  envelope: SessionMutationEnvelope;
  newRevision: number;
  conflictKeys: string[];
}

export interface SessionCoordinatorState {
  projectId: string;
  sessionId: string;
  revision: number;
  session: ProjectSession;
  seenActionIds: string[];
  history: { revision: number; actionId: string; conflictKeys: string[] }[];
}

export type MutationDisposition = "accepted" | "reconciled" | "duplicate" | "rejected" | "resync";

export interface SessionMutationResult {
  disposition: MutationDisposition;
  state: SessionCoordinatorState;
  accepted?: AcceptedSessionMutation;
  reason?:
    | "wrong-project"
    | "wrong-session"
    | "wrong-origin"
    | "permission"
    | "invalid-envelope"
    | "future-revision"
    | "history-gap"
    | "stale-conflict"
    | "invalid-mutation";
  message?: string;
}

export interface SessionPersistenceAdapter {
  save(session: ProjectSession, revision: number): Promise<void>;
}

const HISTORY_LIMIT = 256;
const SEEN_ACTION_LIMIT = 1024;
const WILDCARD_KEY = "*";

export function createSessionCoordinatorState(
  session: ProjectSession,
  options: { sessionId?: string; revision?: number } = {},
): SessionCoordinatorState {
  return {
    projectId: session.projectId,
    sessionId: options.sessionId ?? collisionResistantId("session"),
    revision: validRevision(options.revision) ? options.revision! : 0,
    session: structuredClone(session),
    seenActionIds: [],
    history: [],
  };
}

export function createMutationEnvelope(
  state: SessionCoordinatorState,
  originWindowId: string,
  payload: SessionMutation,
  options: { actionId?: string; baseRevision?: number; issuedAt?: string; actorId?: string } = {},
): SessionMutationEnvelope {
  return {
    protocolVersion: 1,
    projectId: state.projectId,
    sessionId: state.sessionId,
    originWindowId,
    actorId: options.actorId ?? state.session.workspace.currentUserId,
    actionId: options.actionId ?? collisionResistantId(originWindowId || "window"),
    baseRevision: options.baseRevision ?? state.revision,
    issuedAt: options.issuedAt ?? new Date().toISOString(),
    payload: structuredClone(payload),
  };
}

/**
 * Applies one action to the authoritative state. A stale action is reconciled only
 * when none of its durable conflict keys changed after the action's base revision.
 */
export function submitSessionMutation(
  state: SessionCoordinatorState,
  envelope: SessionMutationEnvelope,
  authority?: { registeredWindowId: string },
): SessionMutationResult {
  const envelopeError = validateEnvelope(envelope);
  if (envelopeError) return rejected(state, "invalid-envelope", envelopeError);
  if (envelope.projectId !== state.projectId) return rejected(state, "wrong-project", "Mutation belongs to another project.");
  if (envelope.sessionId !== state.sessionId) return rejected(state, "wrong-session", "Mutation belongs to another live session.");
  if (authority && authority.registeredWindowId !== envelope.originWindowId) return rejected(state, "wrong-origin", "Mutation origin does not match its registered native window.");
  if (envelope.actorId !== state.session.workspace.currentUserId) {
    return rejected(state, "permission", "Mutation actor does not match the authoritative local project identity.");
  }
  if (!hasPermission(state.session.workspace, envelope.actorId, "edit")) return rejected(state, "permission", "Collaborator cannot edit this project.");
  if (state.seenActionIds.includes(envelope.actionId)) return { disposition: "duplicate", state };
  if (envelope.baseRevision > state.revision) return rejected(state, "future-revision", "Authoritative state is behind the mutation base; request a snapshot.", "resync");

  const conflictKeys = mutationConflictKeys(envelope.payload);
  const stale = envelope.baseRevision < state.revision;
  if (stale) {
    const earliestRetainedBase = state.history.length ? state.history[0].revision - 1 : state.revision;
    if (envelope.baseRevision < earliestRetainedBase) {
      return rejected(state, "history-gap", "Mutation is older than retained reconciliation history; request a snapshot.", "resync");
    }
    const changedSinceBase = new Set(state.history
      .filter((entry) => entry.revision > envelope.baseRevision)
      .flatMap((entry) => entry.conflictKeys));
    if (conflictKeys.some((key) => conflicts(key, changedSinceBase))) {
      return rejected(state, "stale-conflict", "The same project content changed in another window; request a snapshot.");
    }
  }

  let session: ProjectSession;
  try {
    session = applySessionMutation(state.session, envelope.payload);
  } catch (error) {
    return rejected(state, "invalid-mutation", error instanceof Error ? error.message : "Mutation could not be applied.");
  }
  const newRevision = state.revision + 1;
  const next: SessionCoordinatorState = {
    ...state,
    revision: newRevision,
    session,
    seenActionIds: [...state.seenActionIds, envelope.actionId].slice(-SEEN_ACTION_LIMIT),
    history: [...state.history, { revision: newRevision, actionId: envelope.actionId, conflictKeys }].slice(-HISTORY_LIMIT),
  };
  return {
    disposition: stale ? "reconciled" : "accepted",
    state: next,
    accepted: { envelope: structuredClone(envelope), newRevision, conflictKeys },
  };
}

export function applyAcceptedSnapshot(
  state: SessionCoordinatorState,
  snapshot: { projectId: string; sessionId: string; revision: number; session: ProjectSession },
): SessionCoordinatorState {
  if (snapshot.projectId !== state.projectId || snapshot.sessionId !== state.sessionId) {
    throw new Error("Coordinator snapshot belongs to another project session.");
  }
  if (!validRevision(snapshot.revision) || snapshot.revision < state.revision) {
    throw new Error("Coordinator snapshot revision is stale or invalid.");
  }
  return {
    ...state,
    revision: snapshot.revision,
    session: structuredClone(snapshot.session),
    history: [],
    seenActionIds: [],
  };
}

export function applySessionMutation(
  input: ProjectSession,
  payload: SessionMutation,
): ProjectSession {
  const session = structuredClone(input);
  const mutations = payload.kind === "batch" ? payload.mutations : [payload];
  if (!mutations.length) throw new Error("A mutation batch cannot be empty.");
  for (const mutation of mutations) applyAtomicMutation(session, mutation);
  return session;
}

export function mutationConflictKeys(payload: SessionMutation): string[] {
  const mutations = payload.kind === "batch" ? payload.mutations : [payload];
  return [...new Set(mutations.flatMap((mutation) => {
    switch (mutation.kind) {
      case "set-project-name": return ["project:name"];
      case "set-project-type": return ["project:type"];
      case "set-persistence-metadata": return ["project:persistence"];
      case "insert-document": return ["documents:order", `document:${requiredDocumentId(mutation.document)}`];
      case "remove-document": return [
        "documents:order",
        `document:${mutation.documentId}`,
        "project:active-document",
        "versions",
        "workspace",
      ];
      case "replace-document": return [`document:${mutation.documentId}`];
      case "insert-block": return [`document:${mutation.documentId}:blocks:order`, `block:${mutation.documentId}:${mutation.block.id}`];
      case "replace-block": return [`block:${mutation.documentId}:${mutation.blockId}`];
      case "remove-block": return [`document:${mutation.documentId}:blocks:order`, `block:${mutation.documentId}:${mutation.blockId}`];
      case "set-workspace": return ["workspace"];
      case "upsert-layout": return [`layout:${mutation.layout.id}`];
      case "delete-layout": return [`layout:${mutation.layoutId}`];
      case "set-version-history": return ["version-history"];
      case "replace-session": return [WILDCARD_KEY];
    }
  }))];
}

/** Selects a granular mutation for the common one-document/one-block React update path. */
export function deriveSessionMutation(before: ProjectSession, after: ProjectSession): SessionMutation {
  if (before.projectId !== after.projectId) return { kind: "replace-session", session: after };

  const stableTopLevelBefore = {
    schemaVersion: before.schemaVersion,
    projectId: before.projectId,
    createdAt: before.createdAt,
    documents: before.documents,
    versions: before.versions,
    activeDocumentId: before.activeDocumentId,
  };
  const stableTopLevelAfter = {
    schemaVersion: after.schemaVersion,
    projectId: after.projectId,
    createdAt: after.createdAt,
    documents: after.documents,
    versions: after.versions,
    activeDocumentId: after.activeDocumentId,
  };
  if (json(stableTopLevelBefore) === json(stableTopLevelAfter)) {
    const mutations: AtomicSessionMutation[] = [];
    if (before.name !== after.name) mutations.push({ kind: "set-project-name", name: after.name });
    if (before.projectType !== after.projectType) mutations.push({ kind: "set-project-type", projectType: after.projectType });
    if (json(before.workspace) !== json(after.workspace)) mutations.push({ kind: "set-workspace", workspace: after.workspace });
    if (json(before.versionHistory) !== json(after.versionHistory)) {
      mutations.push({ kind: "set-version-history", versionHistory: after.versionHistory });
    }
    if (before.projectPath !== after.projectPath || before.updatedAt !== after.updatedAt) {
      mutations.push({
        kind: "set-persistence-metadata",
        projectPath: after.projectPath,
        updatedAt: after.updatedAt,
      });
    }
    if (mutations.length === 1) return mutations[0];
    if (mutations.length > 1) return { kind: "batch", mutations };
  }
  const beforeStable = { ...before, documents: undefined, updatedAt: undefined };
  const afterStable = { ...after, documents: undefined, updatedAt: undefined };
  if (json(beforeStable) === json(afterStable)) {
    const beforeIds = before.documents.map((document) => document.id);
    const afterIds = after.documents.map((document) => document.id);
    if (json(beforeIds) === json(afterIds)) {
      const changed = after.documents.flatMap((document, index) => json(document) === json(before.documents[index]) ? [] : [{ before: before.documents[index], after: document }]);
      if (changed.length === 1 && changed[0].before.id && changed[0].before.id === changed[0].after.id) {
        const blockMutation = deriveBlockMutation(changed[0].before, changed[0].after);
        return blockMutation ?? { kind: "replace-document", documentId: changed[0].before.id, document: changed[0].after };
      }
    }
  }
  if (json({ ...before, workspace: undefined, updatedAt: undefined }) === json({ ...after, workspace: undefined, updatedAt: undefined })) {
    return { kind: "set-workspace", workspace: after.workspace };
  }
  if (json({ ...before, versionHistory: undefined, updatedAt: undefined }) === json({ ...after, versionHistory: undefined, updatedAt: undefined })) {
    return { kind: "set-version-history", versionHistory: after.versionHistory };
  }
  if (json({ ...before, name: undefined, updatedAt: undefined }) === json({ ...after, name: undefined, updatedAt: undefined })) {
    return { kind: "set-project-name", name: after.name };
  }
  return { kind: "replace-session", session: after };
}

/** Serializes accepted revisions so project recovery writes cannot overtake one another. */
export class SerializedSessionSaveQueue {
  readonly #adapter: SessionPersistenceAdapter;
  #tail: Promise<void> = Promise.resolve();
  #lastQueuedRevision = -1;

  constructor(adapter: SessionPersistenceAdapter) {
    this.#adapter = adapter;
  }

  enqueue(session: ProjectSession, revision: number): Promise<void> {
    if (!validRevision(revision) || revision < this.#lastQueuedRevision) {
      return Promise.reject(new Error("Cannot queue an invalid or older project revision."));
    }
    this.#lastQueuedRevision = revision;
    const snapshot = structuredClone(session);
    const pending = this.#tail.then(() => this.#adapter.save(snapshot, revision));
    this.#tail = pending.catch(() => undefined);
    return pending;
  }

  flush(): Promise<void> {
    return this.#tail;
  }
}

function applyAtomicMutation(session: ProjectSession, mutation: AtomicSessionMutation): void {
  switch (mutation.kind) {
    case "set-project-name": {
      const name = mutation.name.trim();
      if (!name) throw new Error("Project name cannot be empty.");
      session.name = name;
      return;
    }
    case "set-project-type":
      session.projectType = mutation.projectType;
      return;
    case "set-persistence-metadata": {
      if (
        typeof mutation.projectPath !== "string"
        || typeof mutation.updatedAt !== "string"
        || !mutation.updatedAt.trim()
        || mutation.updatedAt.length > 128
        || /[\u0000-\u001f\u007f]/.test(mutation.updatedAt)
      ) {
        throw new Error("Project persistence metadata is invalid.");
      }
      session.projectPath = mutation.projectPath;
      session.updatedAt = mutation.updatedAt;
      return;
    }
    case "insert-document": {
      const document = structuredClone(mutation.document);
      const id = requiredDocumentId(document);
      if (session.documents.some((candidate) => candidate.id === id)) throw new Error("Document id already exists.");
      const afterIndex = mutation.afterDocumentId
        ? session.documents.findIndex((candidate) => candidate.id === mutation.afterDocumentId)
        : session.documents.length - 1;
      if (mutation.afterDocumentId && afterIndex < 0) throw new Error("Document insertion anchor no longer exists.");
      session.documents.splice(afterIndex + 1, 0, document);
      return;
    }
    case "remove-document": {
      const recovery = session.versionHistory.snapshots.find((snapshot) => snapshot.id === mutation.recoverySnapshotId);
      if (!recovery?.session.documents.some((document) => document.id === mutation.documentId)) {
        throw new Error("Document removal requires a project snapshot containing that screenplay.");
      }
      const removed = removeProjectDocument(session, mutation.documentId, { canRemove: true, confirmedDocumentId: mutation.documentId });
      Object.assign(session, removed.session);
      return;
    }
    case "replace-document": {
      const index = documentIndex(session, mutation.documentId);
      const document = structuredClone(mutation.document);
      if (requiredDocumentId(document) !== mutation.documentId) throw new Error("Replacement document id does not match its target.");
      session.documents[index] = document;
      return;
    }
    case "insert-block": {
      const document = findDocument(session, mutation.documentId);
      if (!mutation.block.id.trim() || document.blocks.some((block) => block.id === mutation.block.id)) throw new Error("Block id is empty or already exists.");
      const beforeIndex = mutation.beforeBlockId
        ? document.blocks.findIndex((block) => block.id === mutation.beforeBlockId)
        : document.blocks.length;
      if (mutation.beforeBlockId && beforeIndex < 0) throw new Error("Block insertion anchor no longer exists.");
      document.blocks.splice(beforeIndex, 0, structuredClone(mutation.block));
      return;
    }
    case "replace-block": {
      const document = findDocument(session, mutation.documentId);
      const index = document.blocks.findIndex((block) => block.id === mutation.blockId);
      if (index < 0) throw new Error("Block no longer exists.");
      if (mutation.expectedFingerprint && mutation.expectedFingerprint !== blockCoordinatorFingerprint(document.blocks[index])) throw new Error("Block changed since the mutation was created.");
      if (mutation.block.id !== mutation.blockId) throw new Error("Replacement block id does not match its target.");
      document.blocks[index] = structuredClone(mutation.block);
      return;
    }
    case "remove-block": {
      const document = findDocument(session, mutation.documentId);
      const index = document.blocks.findIndex((block) => block.id === mutation.blockId);
      if (index < 0) throw new Error("Block no longer exists.");
      if (mutation.expectedFingerprint && mutation.expectedFingerprint !== blockCoordinatorFingerprint(document.blocks[index])) throw new Error("Block changed since the mutation was created.");
      document.blocks.splice(index, 1);
      return;
    }
    case "set-workspace":
      session.workspace = structuredClone(mutation.workspace);
      return;
    case "upsert-layout":
      session.workspace = saveCustomLayout(session.workspace, mutation.layout);
      return;
    case "delete-layout":
      session.workspace = deleteCustomLayout(session.workspace, mutation.layoutId);
      return;
    case "set-version-history":
      session.versionHistory = structuredClone(mutation.versionHistory);
      return;
    case "replace-session": {
      if (mutation.session.projectId !== session.projectId) throw new Error("Replacement session belongs to another project.");
      const replacement = structuredClone(mutation.session);
      for (const key of Object.keys(session) as (keyof ProjectSession)[]) delete session[key];
      Object.assign(session, replacement);
      return;
    }
  }
}

function deriveBlockMutation(before: ScreenplayDocument, after: ScreenplayDocument): AtomicSessionMutation | undefined {
  const beforeStable = { ...before, blocks: undefined };
  const afterStable = { ...after, blocks: undefined };
  if (json(beforeStable) !== json(afterStable)) return undefined;
  const documentId = requiredDocumentId(before);
  const beforeIds = before.blocks.map((block) => block.id);
  const afterIds = after.blocks.map((block) => block.id);
  if (json(beforeIds) === json(afterIds)) {
    const changed = after.blocks.flatMap((block, index) => json(block) === json(before.blocks[index]) ? [] : [block]);
    if (changed.length === 1) {
      const previous = before.blocks.find((block) => block.id === changed[0].id)!;
      return { kind: "replace-block", documentId, blockId: changed[0].id, block: changed[0], expectedFingerprint: blockCoordinatorFingerprint(previous) };
    }
    return undefined;
  }
  if (after.blocks.length === before.blocks.length + 1) {
    const inserted = after.blocks.find((block) => !beforeIds.includes(block.id));
    if (inserted) {
      const index = after.blocks.indexOf(inserted);
      const without = after.blocks.filter((block) => block !== inserted);
      if (json(without) === json(before.blocks)) return { kind: "insert-block", documentId, block: inserted, beforeBlockId: after.blocks[index + 1]?.id };
    }
  }
  if (after.blocks.length === before.blocks.length - 1) {
    const removed = before.blocks.find((block) => !afterIds.includes(block.id));
    if (removed && json(before.blocks.filter((block) => block !== removed)) === json(after.blocks)) {
      return { kind: "remove-block", documentId, blockId: removed.id, expectedFingerprint: blockCoordinatorFingerprint(removed) };
    }
  }
  return undefined;
}

function validateEnvelope(envelope: SessionMutationEnvelope): string | undefined {
  if (!envelope || typeof envelope !== "object") return "Mutation envelope is missing.";
  if (envelope.protocolVersion !== 1) return "Mutation protocol version is unsupported.";
  if (![envelope.projectId, envelope.sessionId, envelope.originWindowId, envelope.actorId, envelope.actionId].every((value) => typeof value === "string" && value.trim())) {
    return "Mutation envelope identities must be non-empty strings.";
  }
  if (!validRevision(envelope.baseRevision)) return "Mutation base revision is invalid.";
  if (typeof envelope.issuedAt !== "string" || !envelope.issuedAt.trim()) return "Mutation timestamp is invalid.";
  if (!envelope.payload || typeof envelope.payload !== "object" || typeof envelope.payload.kind !== "string") return "Mutation payload is invalid.";
  return undefined;
}

function conflicts(key: string, changed: ReadonlySet<string>): boolean {
  return [...changed].some((prior) => resourceKeysConflict(key, prior));
}

/** Directional: a stale whole-workspace write cannot erase a newer granular layout edit. */
function resourceKeysConflict(incoming: string, prior: string): boolean {
  if (incoming === WILDCARD_KEY || prior === WILDCARD_KEY || incoming === prior) return true;
  if (incoming === "workspace" && prior.startsWith("layout:")) return true;
  if (incoming.startsWith("layout:") && prior === "workspace") return false;
  const incomingDocument = documentScope(incoming);
  const priorDocument = documentScope(prior);
  if (!incomingDocument || incomingDocument !== priorDocument) return false;
  return incoming.startsWith("document:") && !incoming.includes(":blocks:")
    || prior.startsWith("document:") && !prior.includes(":blocks:");
}

function documentScope(key: string): string | undefined {
  if (key.startsWith("document:")) return key.slice("document:".length).split(":")[0];
  if (key.startsWith("block:")) return key.slice("block:".length).split(":")[0];
  return undefined;
}

function rejected(
  state: SessionCoordinatorState,
  reason: SessionMutationResult["reason"],
  message: string,
  disposition: "rejected" | "resync" = "rejected",
): SessionMutationResult {
  return { disposition, state, reason, message };
}

function findDocument(session: ProjectSession, documentId: string): ScreenplayDocument {
  return session.documents[documentIndex(session, documentId)];
}

function documentIndex(session: ProjectSession, documentId: string): number {
  const index = session.documents.findIndex((document) => document.id === documentId);
  if (index < 0) throw new Error("Document no longer exists.");
  return index;
}

function requiredDocumentId(document: ScreenplayDocument): string {
  if (!document.id?.trim()) throw new Error("Document id is required for coordinated mutations.");
  return document.id;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function blockCoordinatorFingerprint(block: ScreenplayBlock): string {
  const source = JSON.stringify(block);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `block-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function collisionResistantId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 32) || "scs";
  return `${safePrefix}-${crypto.randomUUID()}`;
}
