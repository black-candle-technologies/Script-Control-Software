import assert from "node:assert/strict";
import test from "node:test";
import { deriveScenes, emptyWorkspace } from "./screenplay.ts";
import { parseFountain } from "./fountain.ts";
import { createProjectSession, syncSeriesDocuments } from "./projectWorkspace.ts";
import { compileSeriesWorkspace, detectSeriesContinuityIssues } from "./seriesWorkspace.ts";

function episode(id: string, title: string, script: string) {
  const document = parseFountain(`Title: ${title}\n\n${script}`);
  document.id = id;
  document.workspace = emptyWorkspace();
  return document;
}

function series() {
  const pilot = episode("episode-1", "Pilot", "INT. HOUSE - NIGHT\n\nMara finds a key.\n\nMARA\nWe begin.\n\nELI\nCareful.");
  const second = episode("episode-2", "The Return", "INT. HOUSE - DAY\n\nMara uses the key.\n\nMARA\nIt still fits.");
  const session = createProjectSession(pilot, "television");
  session.name = "Lantern House";
  session.documents.push(second);
  syncSeriesDocuments(session.workspace.series, session.documents);
  session.workspace.series.showBible = "# Canon\nThe house remembers.";
  session.workspace.series.seasons[0].arc = "Mara learns what the house wants.";
  session.workspace.series.characterArcs.MARA = "From skeptic to caretaker.";
  const pilotMeta = session.workspace.series.episodes[pilot.id!];
  const secondMeta = session.workspace.series.episodes[second.id!];
  pilotMeta.productionCode = "S01E01";
  pilotMeta.coldOpen = true;
  pilotMeta.storyLines = [{ id: "house-mystery", label: "House Mystery", kind: "A", sceneIds: [deriveScenes(pilot.blocks)[0].id] }];
  secondMeta.productionCode = "S01E02";
  secondMeta.tag = true;
  secondMeta.storyLines = [{ id: "house-mystery", label: "House Mystery", kind: "A", sceneIds: [deriveScenes(second.blocks)[0].id] }];
  second.workspace!.plotThreads = [{ id: "house-mystery", label: "House Mystery", keywords: ["key"], resolved: true }];
  return session;
}

test("series report derives shared bible, episode and season summaries without mutating the session", () => {
  const session = series();
  const before = structuredClone(session);
  const report = compileSeriesWorkspace(session);

  assert.equal(report.showBible.title, "Lantern House");
  assert.match(report.showBible.markdown, /house remembers/);
  assert.deepEqual(report.showBible.recurringCharacters, ["MARA"]);
  assert.deepEqual(report.showBible.recurringLocations, ["HOUSE"]);
  assert.deepEqual(report.showBible.recurringObjects, ["KEY"]);
  assert.equal(report.episodes.length, 2);
  assert.equal(report.episodes[0].productionCode, "S01E01");
  assert.equal(report.seasons[0].episodeCount, 2);
  assert.equal(report.seasons[0].sceneCount, 2);
  assert.deepEqual(report.continuity.characters.find((entry) => entry.name === "MARA")?.episodeIds, ["episode-1", "episode-2"]);
  assert.deepEqual(session, before);
});

test("plot threads and season-board rows connect episode metadata to deterministic coverage", () => {
  const report = compileSeriesWorkspace(series());
  const thread = report.plotThreads.find((item) => item.id === "house-mystery");

  assert.equal(thread?.status, "resolved");
  assert.deepEqual(thread?.episodes.map((episode) => episode.episodeId), ["episode-1", "episode-2"]);
  assert.deepEqual(report.seasonBoard[0].stories.A, ["House Mystery"]);
  assert.equal(report.seasonBoard[0].coldOpen, true);
  assert.equal(report.seasonBoard[1].tag, true);
});

test("continuity checks report only deterministic broken or unresolved state", () => {
  const session = series();
  const pilot = session.documents[0];
  const second = session.documents[1];
  const pilotMeta = session.workspace.series.episodes[pilot.id!];
  const secondMeta = session.workspace.series.episodes[second.id!];
  secondMeta.number = pilotMeta.number;
  secondMeta.actBreakSceneIds = ["missing-scene"];
  pilot.workspace!.plotThreads = [{ id: "reopened", label: "Reopened Thread", keywords: ["key"], resolved: true }];
  second.workspace!.plotThreads = [
    { id: "reopened", label: "Reopened Thread", keywords: ["key"], resolved: false },
    { id: "broken", label: "Broken Thread", sceneIds: ["missing-scene"] },
  ];
  session.workspace.series.continuity.push({ id: "canon-1", kind: "question", title: "Who owns the key?", detail: "Unanswered", episodeIds: [pilot.id!, "missing-episode"], resolved: false });

  const issues = detectSeriesContinuityIssues(session);
  const codes = new Set(issues.map((issue) => issue.code));
  assert.deepEqual(codes, new Set(["open-record", "missing-episode-reference", "missing-scene-reference", "missing-thread-reference", "duplicate-episode-number", "reopened-thread"]));
});
