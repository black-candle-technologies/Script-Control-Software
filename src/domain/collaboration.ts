import type {
  Collaborator,
  CollaboratorRole,
  DraftApproval,
  ProjectSession,
  ProjectWorkspace,
  ReviewItem,
  WriterRoomState,
  WriterRoomTask,
} from "./projectWorkspace.ts";
import { documentsForPortableStorage, restoreLocalDocumentState, restoreLocalWorkspaceState, versionsForPortableStorage, workspaceForPortableStorage } from "./projectWorkspace.ts";
import { emptyWorkspace } from "./screenplay.ts";
import { mergeSnapshots, versionHistoryForPortableStorage, type MergeConflict, type MergeResolution, type MergeResolutionPlan, type ProjectSnapshot } from "./versioning.ts";

export type CollaborationPermission =
  | "view"
  | "edit"
  | "comment"
  | "suggest"
  | "approve"
  | "manage-collaborators"
  | "manage-reviews"
  | "manage-writer-room"
  | "resolve-conflicts";

export const COLLABORATOR_ROLES: readonly CollaboratorRole[] = ["owner", "writer", "co-writer", "director", "producer", "story-editor", "script-coordinator", "reader", "viewer"];

const ROLE_PERMISSIONS: Record<CollaboratorRole, readonly CollaborationPermission[]> = {
  owner: ["view", "edit", "comment", "suggest", "approve", "manage-collaborators", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
  writer: ["view", "edit", "comment", "suggest", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
  "co-writer": ["view", "edit", "comment", "suggest", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
  director: ["view", "comment", "suggest", "approve", "manage-reviews"],
  producer: ["view", "comment", "suggest", "approve", "manage-reviews", "manage-writer-room"],
  "story-editor": ["view", "edit", "comment", "suggest", "approve", "manage-reviews", "manage-writer-room"],
  "script-coordinator": ["view", "edit", "comment", "suggest", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
  reader: ["view", "comment", "suggest"],
  viewer: ["view"],
};

export interface ReviewTarget {
  targetType: ReviewItem["targetType"];
  targetId: string;
  documentId?: string;
}

export interface NewComment extends ReviewTarget {
  id: string;
  text: string;
  createdAt: string;
}

export interface NewSuggestion extends NewComment {
  originalText: string;
  suggestedText: string;
}

export interface SuggestionConflict {
  kind: "stale-target";
  targetType: "block" | "treatment";
  targetId: string;
  documentId?: string;
  expected: string;
  actual: string;
  suggested: string;
}

export interface SuggestionAcceptance {
  session: ProjectSession;
  applied: boolean;
  conflict?: SuggestionConflict;
}

export interface CollaborationMergeResult {
  session: ProjectSession;
  conflicts: MergeConflict[];
  clean: boolean;
  resolution: MergeResolution;
}

export const permissionsFor = (role: CollaboratorRole): CollaborationPermission[] => [...ROLE_PERMISSIONS[role]];

export function hasPermission(workspace: ProjectWorkspace, collaboratorId: string, permission: CollaborationPermission): boolean {
  const collaborator = workspace.collaborators.find((item) => item.id === collaboratorId);
  return collaborator ? ROLE_PERMISSIONS[collaborator.role].includes(permission) : false;
}

export function addCollaborator(workspace: ProjectWorkspace, actorId: string, input: Collaborator): ProjectWorkspace {
  requirePermission(workspace, actorId, "manage-collaborators");
  required(input.id, "Collaborator id");
  required(input.name, "Collaborator name");
  if (!COLLABORATOR_ROLES.includes(input.role)) throw new Error("Choose a valid collaborator role.");
  if (workspace.collaborators.some((item) => item.id === input.id)) throw new Error(`Collaborator '${input.id}' already exists.`);
  return { ...workspace, collaborators: [...workspace.collaborators, { ...input, id: input.id.trim(), name: input.name.trim() }] };
}

export function updateCollaboratorRole(workspace: ProjectWorkspace, actorId: string, collaboratorId: string, role: CollaboratorRole): ProjectWorkspace {
  requirePermission(workspace, actorId, "manage-collaborators");
  const current = collaborator(workspace, collaboratorId);
  if (!COLLABORATOR_ROLES.includes(role)) throw new Error("Choose a valid collaborator role.");
  if (current.role === "owner" && role !== "owner" && workspace.collaborators.filter((item) => item.role === "owner").length === 1) throw new Error("A project must keep at least one owner.");
  if (!ROLE_PERMISSIONS[role].includes("approve") && workspace.approvals.some((approval) => approval.reviewerId === collaboratorId && approval.decision === "pending")) {
    throw new Error("Resolve or reassign this collaborator's pending draft approvals before changing their role.");
  }
  return { ...workspace, collaborators: workspace.collaborators.map((item) => item.id === collaboratorId ? { ...item, role } : item) };
}

export function removeCollaborator(workspace: ProjectWorkspace, actorId: string, collaboratorId: string): ProjectWorkspace {
  requirePermission(workspace, actorId, "manage-collaborators");
  const removed = collaborator(workspace, collaboratorId);
  if (removed.role === "owner" && workspace.collaborators.filter((item) => item.role === "owner").length === 1) throw new Error("A project must keep at least one owner.");
  if (workspace.approvals.some((approval) => approval.reviewerId === collaboratorId && approval.decision === "pending")) {
    throw new Error("Resolve or reassign this collaborator's pending draft approvals before removing them.");
  }
  const collaborators = workspace.collaborators.filter((item) => item.id !== collaboratorId);
  const currentUserId = workspace.currentUserId === collaboratorId ? collaborators.find((item) => item.role === "owner")!.id : workspace.currentUserId;
  return { ...workspace, collaborators, currentUserId };
}

/** Select the local identity used for advisory project permissions. */
export function setCurrentCollaborator(workspace: ProjectWorkspace, collaboratorId: string): ProjectWorkspace {
  collaborator(workspace, collaboratorId);
  return { ...workspace, currentUserId: collaboratorId };
}

export function createComment(workspace: ProjectWorkspace, authorId: string, input: NewComment): ProjectWorkspace {
  requirePermission(workspace, authorId, "comment");
  return addReview(workspace, {
    ...validatedReview(input),
    kind: "comment",
    authorId,
    status: "open",
  });
}

export function createSuggestion(workspace: ProjectWorkspace, authorId: string, input: NewSuggestion): ProjectWorkspace {
  requirePermission(workspace, authorId, "suggest");
  return addReview(workspace, {
    ...validatedReview(input),
    kind: "suggestion",
    authorId,
    originalText: input.originalText,
    suggestedText: input.suggestedText,
    status: "open",
  });
}

export function transitionReview(workspace: ProjectWorkspace, reviewId: string, actorId: string, status: ReviewItem["status"]): ProjectWorkspace {
  const review = findReview(workspace, reviewId);
  if (status === "accepted") throw new Error("Accept suggestions with acceptSuggestion so the target is updated atomically.");
  const allowed = review.kind === "comment" ? ["open", "resolved"] : ["open", "rejected"];
  if (!allowed.includes(status)) throw new Error(`A ${review.kind} cannot transition to '${status}'.`);
  if (review.status === "accepted") throw new Error("An accepted suggestion is final.");
  const ownReview = review.authorId === actorId;
  if (!ownReview && !hasPermission(workspace, actorId, "manage-reviews")) throw new Error("Collaborator cannot manage this review.");
  if (ownReview) requirePermission(workspace, actorId, review.kind === "comment" ? "comment" : "suggest");
  return replaceReview(workspace, { ...review, status });
}

export function acceptSuggestion(session: ProjectSession, suggestionId: string, actorId: string): SuggestionAcceptance {
  requirePermission(session.workspace, actorId, "edit");
  const suggestion = findReview(session.workspace, suggestionId);
  if (suggestion.kind !== "suggestion" || suggestion.status !== "open" || suggestion.suggestedText === undefined || suggestion.originalText === undefined) {
    throw new Error("Only an open suggestion with original and suggested text can be accepted.");
  }
  if (suggestion.targetType !== "block" && suggestion.targetType !== "treatment") throw new Error("Only block and treatment suggestions can be applied.");
  const target = suggestionTarget(session, suggestion);
  if (target.text !== suggestion.originalText) {
    return {
      session,
      applied: false,
      conflict: {
        kind: "stale-target",
        targetType: suggestion.targetType,
        targetId: suggestion.targetId,
        ...(suggestion.documentId ? { documentId: suggestion.documentId } : {}),
        expected: suggestion.originalText,
        actual: target.text,
        suggested: suggestion.suggestedText,
      },
    };
  }
  const next = structuredClone(session);
  applySuggestion(next, target, suggestion.suggestedText);
  next.workspace = replaceReview(next.workspace, { ...suggestion, status: "accepted" });
  return { session: next, applied: true };
}

export function requestDraftApproval(
  workspace: ProjectWorkspace,
  actorId: string,
  input: Omit<DraftApproval, "decision">,
  validVersionIds?: readonly string[],
): ProjectWorkspace {
  requirePermission(workspace, actorId, "edit");
  required(input.id, "Approval id");
  required(input.versionId, "Version id");
  if (validVersionIds && !validVersionIds.includes(input.versionId)) throw new Error(`Draft version '${input.versionId}' does not exist.`);
  required(input.updatedAt, "Approval timestamp");
  if (workspace.approvals.some((approval) => approval.id === input.id)) throw new Error(`Approval '${input.id}' already exists.`);
  requirePermission(workspace, input.reviewerId, "approve");
  return { ...workspace, approvals: [...workspace.approvals, { ...input, note: input.note.trim(), decision: "pending" }] };
}

export function decideDraftApproval(
  workspace: ProjectWorkspace,
  approvalId: string,
  reviewerId: string,
  decision: Exclude<DraftApproval["decision"], "pending">,
  note: string,
  updatedAt: string,
): ProjectWorkspace {
  requirePermission(workspace, reviewerId, "approve");
  required(updatedAt, "Approval timestamp");
  const approval = workspace.approvals.find((item) => item.id === approvalId);
  if (!approval) throw new Error(`Approval '${approvalId}' does not exist.`);
  if (approval.reviewerId !== reviewerId) throw new Error("Only the assigned reviewer can decide this approval.");
  return {
    ...workspace,
    approvals: workspace.approvals.map((item) => item.id === approvalId ? { ...item, decision, note: note.trim(), updatedAt } : item),
  };
}

export function updateWriterRoom(
  workspace: ProjectWorkspace,
  actorId: string,
  update: Partial<Pick<WriterRoomState, "active" | "agenda" | "activeDocumentId" | "activeSceneId">>,
): ProjectWorkspace {
  requirePermission(workspace, actorId, "manage-writer-room");
  return { ...workspace, writerRoom: { ...workspace.writerRoom, ...update, ...(update.agenda === undefined ? {} : { agenda: update.agenda.trim() }) } };
}

export function createWriterRoomTask(workspace: ProjectWorkspace, actorId: string, task: Omit<WriterRoomTask, "done">): ProjectWorkspace {
  requirePermission(workspace, actorId, "manage-writer-room");
  required(task.id, "Task id");
  required(task.text, "Task text");
  if (workspace.writerRoom.tasks.some((item) => item.id === task.id)) throw new Error(`Task '${task.id}' already exists.`);
  if (task.assigneeId) collaborator(workspace, task.assigneeId);
  return {
    ...workspace,
    writerRoom: { ...workspace.writerRoom, tasks: [...workspace.writerRoom.tasks, { ...task, text: task.text.trim(), done: false }] },
  };
}

export function setWriterRoomTaskDone(workspace: ProjectWorkspace, actorId: string, taskId: string, done: boolean): ProjectWorkspace {
  const task = workspace.writerRoom.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Task '${taskId}' does not exist.`);
  if (task.assigneeId !== actorId && !hasPermission(workspace, actorId, "manage-writer-room")) throw new Error("Collaborator cannot update this task.");
  collaborator(workspace, actorId);
  return {
    ...workspace,
    writerRoom: { ...workspace.writerRoom, tasks: workspace.writerRoom.tasks.map((item) => item.id === taskId ? { ...item, done } : item) },
  };
}

export function mergeCollaboratorSessions(
  base: ProjectSession,
  ours: ProjectSession,
  theirs: ProjectSession,
  actorId: string,
  resolution: MergeResolution | MergeResolutionPlan = "ours",
): CollaborationMergeResult {
  requirePermission(base.workspace, actorId, "resolve-conflicts");
  const localActiveDocumentId = ours.activeDocumentId;
  const sharedSession = (session: ProjectSession): ProjectSession => ({
    ...structuredClone(session),
    documents: documentsForPortableStorage(session.documents),
    versions: versionsForPortableStorage(session.versions),
    versionHistory: versionHistoryForPortableStorage(session.versionHistory),
    projectPath: "",
    activeDocumentId: localActiveDocumentId,
    workspace: workspaceForPortableStorage(session.workspace),
  });
  const result = mergeSnapshots(snapshot("base", sharedSession(base)), snapshot("ours", sharedSession(ours)), snapshot("theirs", sharedSession(theirs)), resolution);
  const session = {
    ...result.merged,
    documents: restoreLocalDocumentState(result.merged.documents, ours.documents),
    projectPath: ours.projectPath,
    activeDocumentId: localActiveDocumentId,
    workspace: restoreLocalWorkspaceState(result.merged.workspace, ours.workspace),
  };
  return { session, conflicts: result.conflicts, clean: result.clean, resolution: result.resolution };
}

function addReview(workspace: ProjectWorkspace, review: ReviewItem): ProjectWorkspace {
  if (workspace.reviews.some((item) => item.id === review.id)) throw new Error(`Review '${review.id}' already exists.`);
  return { ...workspace, reviews: [...workspace.reviews, review] };
}

function validatedReview(input: NewComment): NewComment {
  required(input.id, "Review id");
  required(input.targetId, "Review target id");
  required(input.text, "Review text");
  required(input.createdAt, "Review timestamp");
  return { ...input, id: input.id.trim(), targetId: input.targetId.trim(), text: input.text.trim() };
}

function replaceReview(workspace: ProjectWorkspace, review: ReviewItem): ProjectWorkspace {
  return { ...workspace, reviews: workspace.reviews.map((item) => item.id === review.id ? review : item) };
}

function findReview(workspace: ProjectWorkspace, id: string): ReviewItem {
  const review = workspace.reviews.find((item) => item.id === id);
  if (!review) throw new Error(`Review '${id}' does not exist.`);
  return review;
}

function collaborator(workspace: ProjectWorkspace, id: string): Collaborator {
  const found = workspace.collaborators.find((item) => item.id === id);
  if (!found) throw new Error(`Collaborator '${id}' does not exist.`);
  return found;
}

function requirePermission(workspace: ProjectWorkspace, id: string, permission: CollaborationPermission) {
  const found = collaborator(workspace, id);
  if (!ROLE_PERMISSIONS[found.role].includes(permission)) throw new Error(`${found.name} does not have '${permission}' permission.`);
}

type SuggestionTarget =
  | { kind: "block"; documentIndex: number; blockIndex: number; text: string }
  | { kind: "treatment"; documentIndex: number; treatmentIndex?: number; text: string };

function suggestionTarget(session: ProjectSession, suggestion: ReviewItem): SuggestionTarget {
  if (suggestion.targetType === "block") {
    const matches = session.documents.flatMap((document, documentIndex) => document.id !== suggestion.documentId && suggestion.documentId
      ? []
      : document.blocks.flatMap((block, blockIndex) => block.id === suggestion.targetId ? [{ kind: "block" as const, documentIndex, blockIndex, text: block.text }] : []));
    if (matches.length !== 1) throw new Error(`Block target '${suggestion.targetId}' ${matches.length ? "is ambiguous" : "does not exist"}.`);
    return matches[0];
  }
  const treatments = session.documents.flatMap((document, documentIndex) => document.id !== suggestion.documentId && suggestion.documentId
    ? []
    : (document.workspace?.treatments ?? []).flatMap((item, treatmentIndex) => item.id === suggestion.targetId ? [{ kind: "treatment" as const, documentIndex, treatmentIndex, text: item.markdown }] : []));
  if (treatments.length > 1) throw new Error(`Treatment target '${suggestion.targetId}' is ambiguous.`);
  if (treatments.length === 1) return treatments[0];
  const documents = session.documents.flatMap((document, documentIndex) => document.id === (suggestion.documentId ?? suggestion.targetId) ? [{ kind: "treatment" as const, documentIndex, text: document.workspace?.treatment ?? "" }] : []);
  if (documents.length !== 1) throw new Error(`Treatment target '${suggestion.targetId}' ${documents.length ? "is ambiguous" : "does not exist"}.`);
  return documents[0];
}

function applySuggestion(session: ProjectSession, target: SuggestionTarget, text: string) {
  const document = session.documents[target.documentIndex];
  if (target.kind === "block") {
    document.blocks[target.blockIndex] = { ...document.blocks[target.blockIndex], text };
    return;
  }
  const workspace = { ...emptyWorkspace(), ...document.workspace };
  if (target.treatmentIndex === undefined) workspace.treatment = text;
  else {
    workspace.treatments = (workspace.treatments ?? []).map((item, index) => index === target.treatmentIndex ? { ...item, markdown: text } : item);
    if (workspace.activeTreatmentId === workspace.treatments[target.treatmentIndex]?.id) workspace.treatment = text;
  }
  document.workspace = workspace;
}

function snapshot(id: string, session: ProjectSession): ProjectSnapshot {
  return { id, name: id, description: "", createdAt: "", parentIds: [], session };
}

function required(value: string, name: string) {
  if (!value.trim()) throw new Error(`${name} is required.`);
}
