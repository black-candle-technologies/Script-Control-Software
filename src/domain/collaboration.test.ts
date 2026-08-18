import assert from "node:assert/strict";
import test from "node:test";
import { defaultProjectWorkspace, emptyVersionHistory, type ProjectSession, type ProjectWorkspace } from "./projectWorkspace.ts";
import { emptyWorkspace, type ScreenplayDocument } from "./screenplay.ts";
import {
  acceptSuggestion,
  addCollaborator,
  createComment,
  createSuggestion,
  createWriterRoomTask,
  decideDraftApproval,
  hasPermission,
  mergeCollaboratorSessions,
  permissionsFor,
  requestDraftApproval,
  removeCollaborator,
  setCurrentCollaborator,
  setWriterRoomTaskDone,
  transitionReview,
  updateCollaboratorRole,
  updateWriterRoom,
} from "./collaboration.ts";

const workspace = (): ProjectWorkspace => ({
  ...defaultProjectWorkspace(),
  collaborators: [
    { id: "owner", name: "Owner", role: "owner" },
    { id: "writer", name: "Writer", role: "writer" },
    { id: "producer", name: "Producer", role: "producer" },
    { id: "editor", name: "Story Editor", role: "story-editor" },
    { id: "reader", name: "Reader", role: "reader" },
    { id: "viewer", name: "Viewer", role: "viewer" },
  ],
  currentUserId: "owner",
});

const screenplay = (): ScreenplayDocument => ({
  id: "doc-1",
  titlePage: { title: "Collaboration Test", author: "Writer" },
  blocks: [
    { id: "scene-1", type: "scene_heading", text: "INT. ROOM - DAY" },
    { id: "action-1", type: "action", text: "A quiet room." },
  ],
  sceneNotes: {},
  workspace: {
    ...emptyWorkspace(),
    treatment: "Old treatment.",
    activeTreatmentId: "treatment-1",
    treatments: [{ id: "treatment-1", title: "Main", markdown: "Old treatment.", links: [] }],
  },
});

const session = (): ProjectSession => ({
  schemaVersion: 4,
  projectId: "project-1",
  name: "Collaboration Test",
  projectType: "featureFilm",
  createdAt: "2026-07-18T00:00:00Z",
  updatedAt: "2026-07-18T00:00:00Z",
  documents: [screenplay()],
  versions: [],
  versionHistory: emptyVersionHistory(),
  workspace: workspace(),
  projectPath: "C:/projects/collaboration-test",
  activeDocumentId: "doc-1",
});

test("role permissions are explicit and conservative", () => {
  const value = workspace();
  assert.ok(permissionsFor("owner").includes("manage-collaborators"));
  assert.equal(hasPermission(value, "producer", "approve"), true);
  assert.equal(hasPermission(value, "reader", "suggest"), true);
  assert.deepEqual(permissionsFor("viewer"), ["view"]);
  assert.equal(hasPermission(value, "viewer", "comment"), false);
  assert.equal(hasPermission(value, "missing", "view"), false);
  assert.deepEqual(Object.fromEntries([
    "owner", "writer", "co-writer", "director", "producer", "story-editor", "script-coordinator", "reader", "viewer",
  ].map((role) => [role, permissionsFor(role as Parameters<typeof permissionsFor>[0])])), {
    owner: ["view", "edit", "comment", "suggest", "approve", "manage-collaborators", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
    writer: ["view", "edit", "comment", "suggest", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
    "co-writer": ["view", "edit", "comment", "suggest", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
    director: ["view", "comment", "suggest", "approve", "manage-reviews"],
    producer: ["view", "comment", "suggest", "approve", "manage-reviews", "manage-writer-room"],
    "story-editor": ["view", "edit", "comment", "suggest", "approve", "manage-reviews", "manage-writer-room"],
    "script-coordinator": ["view", "edit", "comment", "suggest", "manage-reviews", "manage-writer-room", "resolve-conflicts"],
    reader: ["view", "comment", "suggest"],
    viewer: ["view"],
  });
});

test("owners manage collaborators without losing the final owner", () => {
  const base = workspace();
  const added = addCollaborator(base, "owner", { id: "new-writer", name: " New Writer ", role: "writer" });
  const promoted = updateCollaboratorRole(added, "owner", "new-writer", "co-writer");
  const acting = setCurrentCollaborator(promoted, "new-writer");
  const removed = removeCollaborator(acting, "owner", "new-writer");
  assert.equal(base.collaborators.some((item) => item.id === "new-writer"), false);
  assert.equal(promoted.collaborators.find((item) => item.id === "new-writer")?.role, "co-writer");
  assert.equal(removed.currentUserId, "owner");
  assert.throws(() => updateCollaboratorRole(workspace(), "owner", "owner", "writer"), /at least one owner/i);
  assert.throws(() => removeCollaborator(workspace(), "owner", "owner"), /at least one owner/i);
});

test("comments and suggestions transition immutably and suggestions apply only to current targets", () => {
  const base = session();
  let reviews = createComment(base.workspace, "reader", {
    id: "comment-1",
    targetType: "project",
    targetId: "project-1",
    text: "  Clarify the ending.  ",
    createdAt: "2026-07-18T01:00:00Z",
  });
  assert.equal(base.workspace.reviews.length, 0);
  assert.equal(reviews.reviews[0].text, "Clarify the ending.");
  reviews = transitionReview(reviews, "comment-1", "reader", "resolved");
  assert.equal(reviews.reviews[0].status, "resolved");
  assert.throws(() => createComment(reviews, "viewer", { id: "blocked", targetType: "project", targetId: "project-1", text: "No", createdAt: "now" }), /permission/);

  reviews = createSuggestion(reviews, "reader", {
    id: "suggestion-block",
    targetType: "block",
    targetId: "action-1",
    text: "Make the room tense.",
    originalText: "A quiet room.",
    suggestedText: "A clock ticks in the silent room.",
    createdAt: "2026-07-18T02:00:00Z",
  });
  const withReviews = { ...base, workspace: reviews };
  const accepted = acceptSuggestion(withReviews, "suggestion-block", "writer");
  assert.equal(accepted.applied, true);
  assert.equal(accepted.session.documents[0].blocks[1].text, "A clock ticks in the silent room.");
  assert.equal(accepted.session.workspace.reviews.find((item) => item.id === "suggestion-block")?.status, "accepted");
  assert.equal(withReviews.documents[0].blocks[1].text, "A quiet room.");

  const treatmentReviews = createSuggestion(accepted.session.workspace, "reader", {
    id: "suggestion-treatment",
    targetType: "treatment",
    targetId: "treatment-1",
    text: "Tighten the treatment.",
    originalText: "Old treatment.",
    suggestedText: "New treatment.",
    createdAt: "2026-07-18T03:00:00Z",
  });
  const treatment = acceptSuggestion({ ...accepted.session, workspace: treatmentReviews }, "suggestion-treatment", "editor");
  assert.equal(treatment.session.documents[0].workspace?.treatments?.[0].markdown, "New treatment.");
  assert.equal(treatment.session.documents[0].workspace?.treatment, "New treatment.");

  const staleReviews = createSuggestion(accepted.session.workspace, "reader", {
    id: "suggestion-stale",
    targetType: "block",
    targetId: "action-1",
    text: "Old proposal.",
    originalText: "A quiet room.",
    suggestedText: "Overwrite collaborator work.",
    createdAt: "2026-07-18T04:00:00Z",
  });
  const staleSession = { ...accepted.session, workspace: staleReviews };
  const stale = acceptSuggestion(staleSession, "suggestion-stale", "writer");
  assert.equal(stale.applied, false);
  assert.equal(stale.session, staleSession);
  assert.deepEqual(stale.conflict, {
    kind: "stale-target",
    targetType: "block",
    targetId: "action-1",
    expected: "A quiet room.",
    actual: "A clock ticks in the silent room.",
    suggested: "Overwrite collaborator work.",
  });
});

test("Draft Review comments preserve a normalized comparison anchor", () => {
  const reviewed = createComment(workspace(), "reader", {
    id: "draft-review-comment",
    targetType: "draft-review",
    targetId: " review-1 ",
    changePath: " /documents/doc-1/blocks/action-1/text ",
    text: "  This change needs context.  ",
    createdAt: "2026-07-18T04:15:00Z",
  });
  assert.deepEqual(reviewed.reviews[0], {
    id: "draft-review-comment",
    kind: "comment",
    authorId: "reader",
    targetType: "draft-review",
    targetId: "review-1",
    changePath: "/documents/doc-1/blocks/action-1/text",
    text: "This change needs context.",
    status: "open",
    createdAt: "2026-07-18T04:15:00Z",
  });
});

test("suggestions are scoped to one document when FDX block and treatment ids repeat", () => {
  const base = session();
  const second = screenplay();
  second.id = "doc-2";
  second.blocks[1].text = "Second quiet room.";
  const project = { ...base, documents: [base.documents[0], second] };
  let reviews = createSuggestion(project.workspace, "reader", {
    id: "scoped-block",
    targetType: "block",
    targetId: "action-1",
    documentId: "doc-2",
    text: "Change only episode two.",
    originalText: "Second quiet room.",
    suggestedText: "Episode two room shakes.",
    createdAt: "2026-07-18T04:30:00Z",
  });
  const blockResult = acceptSuggestion({ ...project, workspace: reviews }, "scoped-block", "writer");
  assert.equal(blockResult.session.documents[0].blocks[1].text, "A quiet room.");
  assert.equal(blockResult.session.documents[1].blocks[1].text, "Episode two room shakes.");

  reviews = createSuggestion(blockResult.session.workspace, "reader", {
    id: "scoped-treatment",
    targetType: "treatment",
    targetId: "treatment-1",
    documentId: "doc-2",
    text: "Change one treatment.",
    originalText: "Old treatment.",
    suggestedText: "Episode two treatment.",
    createdAt: "2026-07-18T04:31:00Z",
  });
  const treatmentResult = acceptSuggestion({ ...blockResult.session, workspace: reviews }, "scoped-treatment", "writer");
  assert.equal(treatmentResult.session.documents[0].workspace?.treatments?.[0].markdown, "Old treatment.");
  assert.equal(treatmentResult.session.documents[1].workspace?.treatments?.[0].markdown, "Episode two treatment.");
});

test("approvals and writer-room tasks enforce assigned roles", () => {
  const base = workspace();
  const requested = requestDraftApproval(base, "writer", {
    id: "approval-1",
    versionId: "draft-7",
    reviewerId: "producer",
    note: "Ready for sign-off.",
    updatedAt: "2026-07-18T05:00:00Z",
  }, ["draft-7"]);
  assert.equal(requested.approvals[0].decision, "pending");
  const approved = decideDraftApproval(requested, "approval-1", "producer", "approved", "Approved for table read.", "2026-07-18T06:00:00Z");
  assert.equal(approved.approvals[0].decision, "approved");
  assert.throws(() => decideDraftApproval(requested, "approval-1", "reader", "approved", "", "later"), /permission/);
  assert.throws(() => requestDraftApproval(base, "writer", { id: "missing", versionId: "missing", reviewerId: "producer", note: "", updatedAt: "now" }, ["draft-7"]), /does not exist/);
  assert.throws(() => updateCollaboratorRole(requested, "owner", "producer", "reader"), /pending draft approvals/i);
  assert.throws(() => removeCollaborator(requested, "owner", "producer"), /pending draft approvals/i);

  const openRoom = updateWriterRoom(approved, "writer", { active: true, agenda: "  Break episode three  ", activeSceneId: "scene-1" });
  const assigned = createWriterRoomTask(openRoom, "writer", { id: "task-1", text: "  Rewrite the act out  ", assigneeId: "reader", sceneId: "scene-1" });
  const done = setWriterRoomTaskDone(assigned, "reader", "task-1", true);
  assert.equal(base.writerRoom.active, false);
  assert.equal(done.writerRoom.agenda, "Break episode three");
  assert.deepEqual(done.writerRoom.tasks[0], { id: "task-1", text: "Rewrite the act out", assigneeId: "reader", sceneId: "scene-1", done: true });
  assert.throws(() => setWriterRoomTaskDone(assigned, "viewer", "task-1", true), /cannot update/);
});

test("collaborator merges reuse deterministic three-way conflict handling", () => {
  const base = session();
  const ours = structuredClone(base);
  const theirs = structuredClone(base);
  ours.documents[0].blocks[1].text = "Our room burns.";
  theirs.documents[0].blocks[1].text = "Their room floods.";
  const result = mergeCollaboratorSessions(base, ours, theirs, "owner", "theirs");
  const repeated = mergeCollaboratorSessions(base, ours, theirs, "owner", "theirs");

  assert.deepEqual(result, repeated);
  assert.equal(result.clean, false);
  assert.deepEqual(result.conflicts.map((conflict) => [conflict.path, conflict.kind]), [["/documents/doc-1/blocks/action-1/text", "value"]]);
  assert.equal(result.session.documents[0].blocks[1].text, "Their room floods.");
  assert.equal(base.documents[0].blocks[1].text, "A quiet room.");
  assert.throws(() => mergeCollaboratorSessions(base, ours, theirs, "viewer"), /permission/);
});

test("collaborator merges preserve local identity and independently added workflow records", () => {
  const base = session();
  const ours = structuredClone(base);
  const theirs = structuredClone(base);
  ours.workspace.currentUserId = "reader";
  ours.workspace.sync.gitAuthorName = "Reader workstation";
  ours.workspace.reviews.push({ id: "ours-review", kind: "comment", authorId: "reader", targetType: "project", targetId: base.projectId, text: "Our note", status: "open", createdAt: "ours" });
  theirs.workspace.currentUserId = "producer";
  theirs.workspace.sync.gitAuthorName = "Producer workstation";
  theirs.workspace.reviews.push({ id: "their-review", kind: "comment", authorId: "producer", targetType: "project", targetId: base.projectId, text: "Their note", status: "open", createdAt: "theirs" });
  const result = mergeCollaboratorSessions(base, ours, theirs, "owner");
  assert.equal(result.clean, true);
  assert.equal(result.session.workspace.currentUserId, "reader");
  assert.equal(result.session.workspace.sync.gitAuthorName, "Reader workstation");
  assert.deepEqual(result.session.workspace.reviews.map((review) => review.id), ["ours-review", "their-review"]);
});
