import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  deriveCharacters,
  deriveLocations,
  deriveScenes,
  emptyWorkspace,
  estimatePages,
  paginateBlocks,
  countWords,
  normalizeCharacterName,
  parseHeading,
  isSceneHeadingText,
  isTransitionText,
  reconcileSceneMetadata,
} from "./screenplay.ts";
import { parseFountain, toFountain } from "./fountain.ts";

const sampleText = readFileSync(new URL("../../samples/sample.fountain", import.meta.url), "utf8");
const sample = () => parseFountain(sampleText);

test("sample title page is read", () => {
  const doc = sample();
  assert.equal(doc.titlePage.title, "THE LONG WAY HOME");
  assert.equal(doc.titlePage.author, "SCS Sample");
});

test("fountain element recognition", () => {
  const doc = parseFountain(
    [
      "INT. HOUSE - NIGHT",
      "",
      "A quiet room.",
      "",
      "MARA",
      "(softly)",
      "Hello.",
      "",
      "CUT TO:",
      "",
      ".MONTAGE",
      "",
      "@COMPUTER VOICE",
      "Processing.",
      "",
      "CLOSE ON THE DOOR",
      "",
      "[[remember to fix this scene]]",
      "",
      "!ALL CAPS ACTION LINE",
    ].join("\n"),
  );
  assert.deepEqual(
    doc.blocks.map((b) => b.type),
    [
      "scene_heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
      "scene_heading",
      "character",
      "dialogue",
      "shot",
      "note",
      "action",
    ],
  );
  assert.equal(doc.blocks[6].text, "MONTAGE");
  assert.equal(doc.blocks[7].text, "COMPUTER VOICE");
  assert.equal(doc.blocks[11].text, "ALL CAPS ACTION LINE");
});

test("round trip is stable", () => {
  const once = sample();
  const twice = parseFountain(toFountain(once));
  assert.deepEqual(
    twice.blocks.map((b) => [b.type, b.text]),
    once.blocks.map((b) => [b.type, b.text]),
  );
  assert.deepEqual(twice.titlePage, once.titlePage);
});

test("scenes derive from headings with their characters", () => {
  const scenes = deriveScenes(sample().blocks);
  assert.equal(scenes.length, 3);
  assert.equal(scenes[0].heading, "INT. GREYHOUND BUS - NIGHT");
  assert.deepEqual(scenes[0].characters, ["DELL", "MARA"]);
  assert.deepEqual(scenes[1].characters, ["MARA"]);
});

test("characters derive with cue counts and first appearance", () => {
  const chars = deriveCharacters(sample().blocks);
  const mara = chars.find((c) => c.name === "MARA");
  const dell = chars.find((c) => c.name === "DELL");
  assert.ok(mara && dell);
  assert.equal(mara.firstScene, 1);
  assert.ok(mara.cueCount >= 4);
  assert.ok(dell.cueCount >= 4);
});

test("cue extensions are stripped from character names", () => {
  assert.equal(normalizeCharacterName("MARA (V.O.)"), "MARA");
  assert.equal(normalizeCharacterName("dell (CONT'D) ^"), "DELL");
});

test("locations derive from scene headings", () => {
  const locations = deriveLocations(sample().blocks);
  const bus = locations.find((l) => l.name.startsWith("GREYHOUND BUS"));
  assert.ok(bus);
  assert.deepEqual(bus.intExt, ["INT"]);
  const restStop = locations.find((l) => l.name === "REST STOP - PARKING LOT");
  assert.ok(restStop);
  assert.deepEqual(restStop.intExt, ["EXT"]);
});

test("heading parser splits INT/EXT, location and time", () => {
  assert.deepEqual(parseHeading("INT. GREYHOUND BUS - NIGHT"), {
    intExt: "INT",
    location: "GREYHOUND BUS",
    timeOfDay: "NIGHT",
  });
  assert.deepEqual(parseHeading("EXT. REST STOP - PARKING LOT - NIGHT"), {
    intExt: "EXT",
    location: "REST STOP - PARKING LOT",
    timeOfDay: "NIGHT",
  });
});

test("unusual compound headings and production scene numbers stay visible", () => {
  assert.deepEqual(parseHeading("EXT./INT. MOVING CAR - NIGHT"), { intExt: "EXT/INT", location: "MOVING CAR", timeOfDay: "NIGHT" });
  const scenes = deriveScenes([{ id: "s1", type: "scene_heading", text: "EXT./INT. MOVING CAR - NIGHT", metadata: { Number: "12A" } }]);
  assert.equal(scenes[0].sceneNumber, "12A");
});

test("heading and transition detection", () => {
  assert.ok(isSceneHeadingText("INT. HOUSE - DAY"));
  assert.ok(isSceneHeadingText("ext. road - day"));
  assert.ok(!isSceneHeadingText("INTERIOR MONOLOGUE"));
  assert.ok(isTransitionText("CUT TO:"));
  assert.ok(isTransitionText("SMASH CUT TO:"));
  assert.ok(isTransitionText("FADE OUT."));
  assert.ok(isTransitionText("FADE TO BLACK."));
  assert.ok(!isTransitionText("cut to:"));
  assert.ok(!isTransitionText("FADE OUT NOW"));
});

test("counts are sane for the sample", () => {
  const doc = sample();
  assert.ok(countWords(doc.blocks) > 150);
  assert.equal(estimatePages(doc.blocks), 2);
});

test("pagination creates visible pages without losing blocks", () => {
  const blocks = Array.from({ length: 60 }, (_, index) => ({ id: `b${index}`, type: "action" as const, text: "A line." }));
  const pages = paginateBlocks(blocks);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.flat(), blocks);
});

test("scene-linked metadata follows matching scenes after a parser regenerates ids", () => {
  const previous = parseFountain("INT. HOME - DAY\n\nOld.\n\nEXT. ROAD - NIGHT\n\nDrive.\n");
  const [home, road] = deriveScenes(previous.blocks);
  previous.sceneNotes = { [home.id]: "home note", [road.id]: "road note" };
  previous.workspace = {
    treatment: "",
    showBible: "",
    continuity: "",
    seasonArc: "",
    productionNotes: "",
    comments: [],
    entityStatuses: {},
    sceneMeta: { [road.id]: { summary: "Chase", tags: "car", status: "draft" } },
    omittedSceneIds: [home.id],
  };
  const parsed = parseFountain("EXT. ROAD - NIGHT\n\nDrive faster.\n\nINT. HOME - DAY\n\nNew.\n");
  const reconciled = reconcileSceneMetadata(previous, parsed);
  const [newRoad, newHome] = deriveScenes(reconciled.blocks);
  assert.equal(newRoad.id, road.id);
  assert.equal(newHome.id, home.id);
  assert.equal(reconciled.sceneNotes[newHome.id], "home note");
  assert.equal(reconciled.sceneNotes[newRoad.id], "road note");
  assert.equal(reconciled.workspace?.sceneMeta?.[newRoad.id].summary, "Chase");
  assert.deepEqual(reconciled.workspace?.omittedSceneIds, [newHome.id]);
});

test("external re-import preserves the document identity and every SCS workspace field", () => {
  const previous = parseFountain("INT. HOME - DAY\n\nOld.\n");
  previous.id = "stable-document";
  previous.workspace = {
    ...emptyWorkspace(),
    treatment: "Treatment",
    showBible: "Bible",
    continuity: "Continuity",
    seasonArc: "Arc",
    productionNotes: "Production",
    comments: [{ id: "comment", author: "Writer", text: "Note", createdAt: "2026-01-01", resolved: false }],
    entityStatuses: { MARA: "confirmed" },
    entityNotes: { MARA: "Lead" },
    resolvedBeatIds: ["beat-1"],
    plotThreads: [{ id: "plot-1", label: "Mystery", keywords: ["box"], sceneIds: [] }],
  };
  const parsed = { ...parseFountain("INT. HOME - DAY\n\nNew.\n"), id: "replacement-id", workspace: emptyWorkspace() };
  const reconciled = reconcileSceneMetadata(previous, parsed);

  assert.equal(reconciled.id, "stable-document");
  assert.equal(reconciled.workspace?.treatment, "Treatment");
  assert.equal(reconciled.workspace?.showBible, "Bible");
  assert.equal(reconciled.workspace?.continuity, "Continuity");
  assert.equal(reconciled.workspace?.seasonArc, "Arc");
  assert.equal(reconciled.workspace?.productionNotes, "Production");
  assert.deepEqual(reconciled.workspace?.comments, previous.workspace.comments);
  assert.deepEqual(reconciled.workspace?.entityStatuses, previous.workspace.entityStatuses);
  assert.deepEqual(reconciled.workspace?.entityNotes, previous.workspace.entityNotes);
  assert.deepEqual(reconciled.workspace?.resolvedBeatIds, previous.workspace.resolvedBeatIds);
  assert.deepEqual(reconciled.workspace?.plotThreads, previous.workspace.plotThreads);
});
