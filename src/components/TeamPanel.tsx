import { useEffect, useMemo, useState } from "react";
import {
  COLLABORATOR_ROLES,
  acceptSuggestion,
  addCollaborator,
  createComment,
  createSuggestion,
  createWriterRoomTask,
  decideDraftApproval,
  deriveScenes,
  hasPermission,
  removeCollaborator,
  requestDraftApproval,
  setCurrentCollaborator,
  setWriterRoomTaskDone,
  transitionReview,
  updateCollaboratorRole,
  updateWriterRoom,
  type CollaboratorRole,
  type MergeConflict,
  type ProjectSession,
  type ReviewItem,
  type Scene,
} from "../domain/index.ts";
import type { GitSyncStatus } from "../services/syncService.ts";

export interface CollaborationSyncControls {
  busy: boolean;
  gitStatus?: GitSyncStatus;
  sharedConflicts: MergeConflict[];
  onCreateSharedCopy: () => void;
  onSyncSharedCopy: () => void;
  onResolveSharedConflict: (resolutions: Record<string, "ours" | "theirs">) => void;
  onRefreshGit: () => void;
  onInitializeGit: () => void;
  onCommitGit: (message: string) => void;
  onPullGit: () => void;
  onPushGit: () => void;
}

interface TeamPanelProps {
  session: ProjectSession;
  activeScene: Scene | null;
  onSession: (session: ProjectSession) => void;
  onOpenTarget: (documentId: string, targetId?: string) => void;
  onMessage: (message: string) => void;
  sync: CollaborationSyncControls;
}

interface ReviewTargetOption {
  value: string;
  targetType: ReviewItem["targetType"];
  targetId: string;
  documentId?: string;
  label: string;
  originalText?: string;
}

export default function TeamPanel({ session, activeScene, onSession, onOpenTarget, onMessage, sync }: TeamPanelProps) {
  const workspace = session.workspace;
  const actorId = workspace.currentUserId;
  const actor = workspace.collaborators.find((item) => item.id === actorId)!;
  const [collaboratorName, setCollaboratorName] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState<CollaboratorRole>("writer");
  const [reviewKind, setReviewKind] = useState<"comment" | "suggestion">("comment");
  const [targetValue, setTargetValue] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [suggestedText, setSuggestedText] = useState("");
  const [approvalVersion, setApprovalVersion] = useState("");
  const [approvalReviewer, setApprovalReviewer] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [gitMessage, setGitMessage] = useState("Update shared screenplay project");
  const [agenda, setAgenda] = useState(workspace.writerRoom.agenda);
  const [conflictChoices, setConflictChoices] = useState<Record<string, "ours" | "theirs">>({});

  const document = session.documents.find((item) => item.id === session.activeDocumentId) ?? session.documents[0];
  const blocks = document.blocks;
  const scenes = useMemo(() => deriveScenes(blocks), [blocks]);
  const currentScene = scenes.find((scene) => scene.id === activeScene?.id)
    ?? (activeScene ? scenes[activeScene.number - 1] : null);
  const roomScenes = useMemo(() => session.documents.flatMap((roomDocument) => deriveScenes(roomDocument.blocks).map((scene) => ({
    value: `${encodeURIComponent(roomDocument.id!)}:${encodeURIComponent(scene.id)}`,
    documentId: roomDocument.id!,
    sceneId: scene.id,
    label: `${roomDocument.titlePage.title || roomDocument.title || "Untitled"} · Scene ${scene.number} · ${scene.heading}`,
  }))), [session.documents]);
  const activeRoomScene = roomScenes.find((scene) => scene.documentId === workspace.writerRoom.activeDocumentId && scene.sceneId === workspace.writerRoom.activeSceneId);
  const targets = useMemo<ReviewTargetOption[]>(() => {
    const treatments = document.workspace?.treatments ?? [];
    return [
      { value: `project:${session.projectId}`, targetType: "project", targetId: session.projectId, label: `Project · ${session.name}` },
      { value: `episode:${document.id}`, targetType: "episode", targetId: document.id!, documentId: document.id!, label: `Script · ${document.titlePage.title || "Untitled"}` },
      ...scenes.map((scene) => ({ value: `scene:${document.id}:${scene.id}`, targetType: "scene" as const, targetId: scene.id, documentId: document.id!, label: `Scene ${scene.number} · ${scene.heading}` })),
      ...blocks.map((block, index) => ({ value: `block:${document.id}:${block.id}`, targetType: "block" as const, targetId: block.id, documentId: document.id!, label: `Text ${index + 1} · ${block.text.slice(0, 55) || "(empty)"}`, originalText: block.text })),
      ...treatments.map((treatment) => ({ value: `treatment:${document.id}:${treatment.id}`, targetType: "treatment" as const, targetId: treatment.id, documentId: document.id!, label: `Treatment · ${treatment.title}`, originalText: treatment.markdown })),
    ];
  }, [blocks, document, scenes, session.name, session.projectId]);
  const reviewTargets = reviewKind === "suggestion" ? targets.filter((target) => target.targetType === "block" || target.targetType === "treatment") : targets;
  const defaultTarget = currentScene ? `scene:${document.id}:${currentScene.id}` : targets[0]?.value;
  const selectedTarget = reviewTargets.find((target) => target.value === targetValue) ?? reviewTargets.find((target) => target.value === defaultTarget) ?? reviewTargets[0];
  const approvers = workspace.collaborators.filter((collaborator) => hasPermission(workspace, collaborator.id, "approve"));
  const selectedVersion = approvalVersion || session.versionHistory.snapshots.slice(-1)[0]?.id || "";
  const selectedReviewer = approvalReviewer || approvers[0]?.id || "";
  const permissionSummary = (["edit", "comment", "suggest", "approve"] as const).filter((permission) => hasPermission(workspace, actorId, permission));
  const canSync = hasPermission(workspace, actorId, "resolve-conflicts");
  const conflictSignature = sync.sharedConflicts.map((conflict) => `${conflict.path}:${conflict.resolution}`).join("\n");

  useEffect(() => setAgenda(workspace.writerRoom.agenda), [workspace.writerRoom.agenda]);
  useEffect(() => setConflictChoices(Object.fromEntries(sync.sharedConflicts.map((conflict) => [conflict.path, conflict.resolution]))), [conflictSignature]);

  const commitSession = (nextWorkspace: typeof workspace) => onSession({ ...session, workspace: nextWorkspace });
  const run = (action: () => void, success?: string) => {
    try {
      action();
      if (success) onMessage(success);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The collaboration action failed.");
    }
  };

  const addPerson = () => run(() => {
    if (!collaboratorName.trim()) throw new Error("Enter a collaborator name.");
    const id = `${slug(collaboratorName)}-${crypto.randomUUID()}`;
    commitSession(addCollaborator(workspace, actorId, { id, name: collaboratorName, role: collaboratorRole }));
    setCollaboratorName("");
  }, "Collaborator added to the portable project.");

  const addReviewItem = () => run(() => {
    if (!selectedTarget) throw new Error("Choose a review target.");
    const input = { id: `review-${crypto.randomUUID()}`, targetType: selectedTarget.targetType, targetId: selectedTarget.targetId, documentId: selectedTarget.documentId, text: reviewText, createdAt: new Date().toISOString() };
    const next = reviewKind === "comment"
      ? createComment(workspace, actorId, input)
      : createSuggestion(workspace, actorId, { ...input, originalText: selectedTarget.originalText ?? "", suggestedText });
    commitSession(next);
    setReviewText("");
    setSuggestedText("");
  }, reviewKind === "comment" ? "Comment added." : "Suggested change added.");

  const accept = (id: string) => run(() => {
    const result = acceptSuggestion(session, id, actorId);
    if (!result.applied) throw new Error(`Suggestion conflicts with newer text. Expected “${result.conflict?.expected}” but found “${result.conflict?.actual}”.`);
    onSession(result.session);
  }, "Suggested change accepted and applied.");

  const requestApproval = () => run(() => {
    if (!selectedVersion || !selectedReviewer) throw new Error("Save a draft version and choose an approver first.");
    commitSession(requestDraftApproval(workspace, actorId, { id: `approval-${crypto.randomUUID()}`, versionId: selectedVersion, reviewerId: selectedReviewer, note: "Requested from the Team panel.", updatedAt: new Date().toISOString() }, session.versionHistory.snapshots.map((snapshot) => snapshot.id)));
  }, "Draft approval requested.");

  const updateRoom = (patch: Parameters<typeof updateWriterRoom>[2]) => run(() => commitSession(updateWriterRoom(workspace, actorId, patch)));
  const addTask = () => run(() => {
    commitSession(createWriterRoomTask(workspace, actorId, { id: `task-${crypto.randomUUID()}`, text: taskText, assigneeId: taskAssignee || undefined, documentId: document.id, sceneId: currentScene?.id }));
    setTaskText("");
  }, "Writer-room task added.");

  const updateSync = (patch: Partial<typeof workspace.sync>) => run(() => {
    if (!canSync) throw new Error("The current collaboration role cannot change synchronization settings.");
    commitSession({ ...workspace, sync: { ...workspace.sync, ...patch } });
  });

  return <div className="insp-stack team-panel">
    <p className="insp-hint">Local-first collaboration. Roles are enforced by SCS controls, but remain advisory without a hosted identity provider.</p>

    <h4>Local identity and roles</h4>
    <label className="insp-card-meta">Acting as<select className="element-select" value={actorId} onChange={(event) => commitSession(setCurrentCollaborator(workspace, event.target.value))}>{workspace.collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name} · {roleLabel(collaborator.role)}</option>)}</select></label>
    <div className="insp-card"><div className="insp-card-title">{actor.name} · {roleLabel(actor.role)}</div><div className="insp-card-meta">{permissionSummary.join(" · ") || "view only"}</div></div>
    {workspace.collaborators.map((collaborator) => <div className="team-person" key={collaborator.id}><span>{collaborator.name}</span><select aria-label={`${collaborator.name} role`} className="element-select" value={collaborator.role} disabled={!hasPermission(workspace, actorId, "manage-collaborators")} onChange={(event) => run(() => commitSession(updateCollaboratorRole(workspace, actorId, collaborator.id, event.target.value as CollaboratorRole)))}>{COLLABORATOR_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select><button className="link-btn" disabled={!hasPermission(workspace, actorId, "manage-collaborators")} onClick={() => run(() => commitSession(removeCollaborator(workspace, actorId, collaborator.id)))}>Remove</button></div>)}
    {hasPermission(workspace, actorId, "manage-collaborators") && <><input className="insp-notes-input" value={collaboratorName} onChange={(event) => setCollaboratorName(event.target.value)} placeholder="Collaborator name" /><div className="btn-row"><select className="element-select" value={collaboratorRole} onChange={(event) => setCollaboratorRole(event.target.value as CollaboratorRole)}>{COLLABORATOR_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select><button className="btn" onClick={addPerson}>Add Collaborator</button></div></>}

    <h4>Comments and suggested changes</h4>
    <div className="btn-row"><select className="element-select" value={reviewKind} onChange={(event) => setReviewKind(event.target.value as typeof reviewKind)}><option value="comment">Comment</option><option value="suggestion">Suggested change</option></select><select aria-label="Review target" className="element-select" value={selectedTarget?.value ?? ""} onChange={(event) => setTargetValue(event.target.value)}>{reviewTargets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</select></div>
    <textarea className="insp-notes-input" value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder={reviewKind === "comment" ? "Leave a focused comment…" : "Explain the suggested change…"} />
    {reviewKind === "suggestion" && <textarea className="insp-notes-input" value={suggestedText} onChange={(event) => setSuggestedText(event.target.value)} placeholder="Replacement text…" />}
    <button className="btn" disabled={!hasPermission(workspace, actorId, reviewKind === "comment" ? "comment" : "suggest")} onClick={addReviewItem}>Add {reviewKind === "comment" ? "Comment" : "Suggestion"}</button>
    {workspace.reviews.map((review) => { const target = describeReviewTarget(session, review); return <div className="insp-card" key={review.id}><div className="insp-card-title">{review.kind === "comment" ? "Comment" : "Suggestion"} · {review.status}</div><div className="insp-card-meta">{workspace.collaborators.find((item) => item.id === review.authorId)?.name ?? "Unknown"} · {target.label}</div><p className="insp-card-desc">{review.text}</p>{review.suggestedText !== undefined && <p className="team-suggestion">→ {review.suggestedText}</p>}{target.documentId && <button className="link-btn" onClick={() => onOpenTarget(target.documentId!, target.focusId)}>Open target</button>}{review.status === "open" && <div className="btn-row">{review.kind === "suggestion" && hasPermission(workspace, actorId, "edit") && <button className="btn btn-primary" onClick={() => accept(review.id)}>Accept</button>}<button className="btn btn-ghost" onClick={() => run(() => commitSession(transitionReview(workspace, review.id, actorId, review.kind === "comment" ? "resolved" : "rejected")))}>{review.kind === "comment" ? "Resolve" : "Reject"}</button></div>}{review.kind === "comment" && review.status === "resolved" && <button className="link-btn" onClick={() => run(() => commitSession(transitionReview(workspace, review.id, actorId, "open")))}>Reopen</button>}</div>; })}

    <h4>Draft approvals</h4>
    {!session.versionHistory.snapshots.length ? <p className="insp-hint">Save a Draft Version before requesting approval.</p> : <div className="btn-row"><select aria-label="Approval version" className="element-select" value={selectedVersion} onChange={(event) => setApprovalVersion(event.target.value)}>{session.versionHistory.snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>)}</select><select aria-label="Approval reviewer" className="element-select" value={selectedReviewer} onChange={(event) => setApprovalReviewer(event.target.value)}>{approvers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}</select><button className="btn" disabled={!hasPermission(workspace, actorId, "edit")} onClick={requestApproval}>Request</button></div>}
    {workspace.approvals.map((approval) => <div className="insp-card" key={approval.id}><div className="insp-card-title">{session.versionHistory.snapshots.find((snapshot) => snapshot.id === approval.versionId)?.name ?? "Missing version"} · {approval.decision}</div><div className="insp-card-meta">Reviewer: {workspace.collaborators.find((item) => item.id === approval.reviewerId)?.name ?? "Unknown"}</div>{approval.note && <p className="insp-card-desc">{approval.note}</p>}{approval.decision === "pending" && approval.reviewerId === actorId && <div className="btn-row"><button className="btn btn-primary" onClick={() => run(() => commitSession(decideDraftApproval(workspace, approval.id, actorId, "approved", "Approved", new Date().toISOString())))}>Approve</button><button className="btn btn-ghost" onClick={() => run(() => commitSession(decideDraftApproval(workspace, approval.id, actorId, "changes-requested", "Changes requested", new Date().toISOString())))}>Request Changes</button></div>}</div>)}

    <h4>Writer room</h4>
    <label className="team-check"><input type="checkbox" checked={workspace.writerRoom.active} disabled={!hasPermission(workspace, actorId, "manage-writer-room")} onChange={(event) => updateRoom({ active: event.target.checked })} /> Room active</label>
    <textarea className="insp-notes-input" value={agenda} disabled={!hasPermission(workspace, actorId, "manage-writer-room")} onChange={(event) => setAgenda(event.target.value)} onBlur={() => updateRoom({ agenda })} placeholder="Room agenda…" />
    <select aria-label="Writer room scene" className="element-select" value={activeRoomScene?.value ?? ""} disabled={!hasPermission(workspace, actorId, "manage-writer-room")} onChange={(event) => { const selected = roomScenes.find((scene) => scene.value === event.target.value); updateRoom({ activeDocumentId: selected?.documentId, activeSceneId: selected?.sceneId }); if (selected) onOpenTarget(selected.documentId, selected.sceneId); }}><option value="">No active scene</option>{roomScenes.map((scene) => <option key={scene.value} value={scene.value}>{scene.label}</option>)}</select>
    {activeRoomScene && <button className="link-btn" onClick={() => onOpenTarget(activeRoomScene.documentId, activeRoomScene.sceneId)}>Open room scene</button>}
    {workspace.writerRoom.tasks.map((task) => <label className="team-task" key={task.id}><input type="checkbox" checked={task.done} disabled={task.assigneeId !== actorId && !hasPermission(workspace, actorId, "manage-writer-room")} onChange={(event) => run(() => commitSession(setWriterRoomTaskDone(workspace, actorId, task.id, event.target.checked)))} /><span>{task.text}<small>{workspace.collaborators.find((item) => item.id === task.assigneeId)?.name ?? "Unassigned"}{task.documentId ? ` · ${session.documents.find((item) => item.id === task.documentId)?.titlePage.title ?? "Missing script"}` : ""}</small></span></label>)}
    {hasPermission(workspace, actorId, "manage-writer-room") && <><input className="insp-notes-input" value={taskText} onChange={(event) => setTaskText(event.target.value)} placeholder="New room task…" /><div className="btn-row"><select aria-label="Task assignee" className="element-select" value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)}><option value="">Unassigned</option>{workspace.collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name}</option>)}</select><button className="btn" onClick={addTask}>Add Task</button></div></>}

    <h4>Shared/cloud folder</h4>
    <p className="insp-hint">Use a portable project in a provider-synced or network folder. Atomic saves and stale-write checks protect against silent overwrites.</p>
    {workspace.sync.mode === "folder" && session.projectPath && <div className="sync-path">{session.projectPath}</div>}
    <div className="btn-row"><button className="btn" disabled={sync.busy || !canSync} onClick={sync.onCreateSharedCopy}>{workspace.sync.mode === "folder" && session.projectPath ? "Move Shared Copy" : "Create Shared Copy"}</button><button className="btn btn-primary" disabled={sync.busy || workspace.sync.mode !== "folder" || !session.projectPath || !canSync} onClick={sync.onSyncSharedCopy}>Sync Now</button></div>
    {!!sync.sharedConflicts.length && <div className="sync-conflict"><strong>{sync.sharedConflicts.length} collaborator conflict{sync.sharedConflicts.length === 1 ? "" : "s"}</strong><p>Independent ID-keyed changes are already combined. Inspect each overlap and choose its source before saving the merge.</p>{sync.sharedConflicts.map((conflict) => <div className="sync-conflict-row" key={conflict.path}><code>{conflict.path}</code><span>{conflict.kind}</span><select aria-label={`Resolution for ${conflict.path}`} className="element-select" disabled={!canSync} value={conflictChoices[conflict.path] ?? conflict.resolution} onChange={(event) => setConflictChoices((current) => ({ ...current, [conflict.path]: event.target.value as "ours" | "theirs" }))}><option value="ours">Keep current SCS value</option><option value="theirs">Keep shared value</option></select><details><summary>Inspect values</summary><pre>Current: {compact(conflict.ours)}{"\n"}Shared: {compact(conflict.theirs)}</pre></details></div>)}<button className="btn btn-primary" disabled={sync.busy || !canSync} onClick={() => sync.onResolveSharedConflict(conflictChoices)}>Apply choices and save recovery versions</button></div>}

    <h4>Git remote sync</h4>
    <p className="insp-hint">Optional writer-friendly Git sync uses HTTPS, fast-forward pulls, non-force pushes, and explicit local sync points.</p>
    <label className="insp-card-meta">Branch<input className="insp-notes-input" disabled={!canSync} value={workspace.sync.branch} onChange={(event) => updateSync({ branch: event.target.value })} /></label>
    <label className="insp-card-meta">HTTPS origin<input className="insp-notes-input" disabled={!canSync} value={workspace.sync.remoteUrl} onChange={(event) => updateSync({ remoteUrl: event.target.value })} placeholder="https://host/team/project.git" /></label>
    <label className="insp-card-meta">Git author<input className="insp-notes-input" disabled={!canSync} value={workspace.sync.gitAuthorName || actor.name} onChange={(event) => updateSync({ gitAuthorName: event.target.value })} /></label>
    <label className="insp-card-meta">Author email<input className="insp-notes-input" disabled={!canSync} value={workspace.sync.gitAuthorEmail || `${slug(actor.id)}@scs.local`} onChange={(event) => updateSync({ gitAuthorEmail: event.target.value })} /></label>
    <input className="insp-notes-input" disabled={!canSync} value={gitMessage} onChange={(event) => setGitMessage(event.target.value)} placeholder="Git sync point message" />
    <div className="btn-row"><button className="btn" disabled={sync.busy || !session.projectPath || !canSync} onClick={sync.onInitializeGit}>Initialize</button><button className="btn btn-ghost" disabled={sync.busy || !session.projectPath} onClick={sync.onRefreshGit}>Status</button><button className="btn" disabled={sync.busy || !sync.gitStatus?.initialized || !canSync} onClick={() => sync.onCommitGit(gitMessage)}>Save Sync Point</button><button className="btn btn-ghost" disabled={sync.busy || !sync.gitStatus?.hasRemote || !canSync} onClick={sync.onPullGit}>Pull</button><button className="btn btn-primary" disabled={sync.busy || !sync.gitStatus?.hasRemote || !canSync} onClick={sync.onPushGit}>Push</button></div>
    {sync.gitStatus && <div className="insp-card"><div className="insp-card-title">{sync.gitStatus.initialized ? `${sync.gitStatus.branch ?? "detached"} · ${sync.gitStatus.head?.slice(0, 8) ?? "no commits"}` : "Git not initialized"}</div><div className="insp-card-meta">{sync.gitStatus.dirty ? `${sync.gitStatus.staged} staged · ${sync.gitStatus.modified} modified · ${sync.gitStatus.untracked} new · ${sync.gitStatus.conflicts} conflicts` : "Working project clean"}{sync.gitStatus.upstream ? ` · ${sync.gitStatus.ahead} ahead / ${sync.gitStatus.behind} behind` : ""}</div></div>}
  </div>;
}

function roleLabel(role: CollaboratorRole): string {
  return ({ owner: "Owner", writer: "Writer", "co-writer": "Co-writer", director: "Director", producer: "Producer", "story-editor": "Story editor", "script-coordinator": "Script coordinator", reader: "Reader", viewer: "Viewer" } satisfies Record<CollaboratorRole, string>)[role];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "collaborator";
}

function compact(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 320 ? `${text.slice(0, 317)}…` : text;
}

function describeReviewTarget(session: ProjectSession, review: ReviewItem): { label: string; documentId?: string; focusId?: string } {
  if (review.targetType === "project") return { label: `Project · ${session.name}` };
  if (review.targetType === "draft-review") {
    const draftReview = session.versionHistory.draftReviews.find((item) => item.id === review.targetId);
    if (!draftReview) return { label: "Draft Review · missing review" };
    const source = session.versionHistory.branches.find((branch) => branch.id === draftReview.sourceBranchId)?.name ?? draftReview.sourceBranchId;
    const target = session.versionHistory.branches.find((branch) => branch.id === draftReview.targetBranchId)?.name ?? draftReview.targetBranchId;
    return { label: `Draft Review · ${draftReview.title} · ${source} → ${target}` };
  }
  const matches = session.documents.filter((document) => document.id === (review.documentId ?? (review.targetType === "episode" ? review.targetId : undefined))
    || (!review.documentId && review.targetType === "scene" && deriveScenes(document.blocks).some((scene) => scene.id === review.targetId))
    || (!review.documentId && review.targetType === "block" && document.blocks.some((block) => block.id === review.targetId)));
  const document = matches.length === 1 ? matches[0] : undefined;
  if (!document) return { label: `${review.targetType} · missing or ambiguous target` };
  const title = document.titlePage.title || document.title || "Untitled";
  if (review.targetType === "episode") return { label: `Script · ${title}`, documentId: document.id };
  if (review.targetType === "scene") {
    const scene = deriveScenes(document.blocks).find((item) => item.id === review.targetId);
    return { label: `${title} · ${scene?.heading ?? "Missing scene"}`, documentId: document.id, focusId: scene?.id };
  }
  if (review.targetType === "block") {
    const block = document.blocks.find((item) => item.id === review.targetId);
    return { label: `${title} · ${block?.text.slice(0, 70) || "Missing text"}`, documentId: document.id, focusId: block?.id };
  }
  const treatment = document.workspace?.treatments?.find((item) => item.id === review.targetId);
  return { label: `${title} · Treatment · ${treatment?.title ?? "Main"}`, documentId: document.id };
}
