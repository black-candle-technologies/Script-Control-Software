import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSession, normalizeProjectSession, syncSeriesDocuments } from "./projectWorkspace.ts";
import { emptyDocument } from "./screenplay.ts";

test("a project session gives every document stable shared-series metadata", () => {
  const pilot = emptyDocument("Pilot");
  const session = createProjectSession(pilot, "television");
  const second = emptyDocument("Episode 2");
  session.documents.push(second);
  syncSeriesDocuments(session.workspace.series, session.documents);

  assert.equal(Object.keys(session.workspace.series.episodes).length, 2);
  assert.deepEqual(session.workspace.series.seasons[0].episodeIds, [pilot.id, second.id]);
  assert.equal(session.workspace.series.episodes[second.id!].title, "Episode 2");
});

test("normalization migrates an older bundle and rejects malformed documents", () => {
  const document = emptyDocument("Legacy");
  delete document.id;
  const session = normalizeProjectSession({ name: "Legacy Project", projectType: "featureFilm", documents: [document], versions: [] });
  assert.equal(session.schemaVersion, 3);
  assert.match(session.documents[0].id!, /^document-/);
  assert.equal(session.workspace.collaborators[0].role, "owner");
  assert.throws(() => normalizeProjectSession({ documents: [{ titlePage: {}, blocks: [{ type: "action" }] }] }), /block 1/i);
});

test("normalization repairs duplicate block ids before the editor renders", () => {
  const document = emptyDocument("Duplicates");
  document.blocks = [
    { id: "same", type: "action", text: "One" },
    { id: "same", type: "dialogue", text: "Two" },
  ];
  const session = normalizeProjectSession({ documents: [document] });
  assert.equal(new Set(session.documents[0].blocks.map((block) => block.id)).size, 2);
});
