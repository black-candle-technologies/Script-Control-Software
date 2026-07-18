import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisToCsv,
  analysisToJson,
  analysisToMarkdown,
  analyzeCharacters,
  analyzeLocations,
  analyzeObjects,
  applyEntityOverrides,
  compileAnalysis,
  type AnalysisEntities,
  type EntityOverride,
  type ProductionCategory,
} from "./analysis.ts";
import type { ScreenplayBlock, ScreenplayDocument, ScreenplayElementType } from "./screenplay.ts";

const block = (id: string, type: ScreenplayElementType, text: string, metadata?: Record<string, string>): ScreenplayBlock => ({ id, type, text, metadata });

const document: ScreenplayDocument = {
  id: "episode-1",
  title: "Signal Fire",
  titlePage: { title: "SIGNAL FIRE", author: "Test Writer" },
  sceneNotes: {},
  characters: [{
    id: "imported-mara",
    canonicalName: "MARA",
    displayName: "Mara",
    aliases: ["M. VALE"],
    firstAppearanceBlockId: "c1",
    sceneIds: ["s1", "s3", "s4"],
    dialogueBlockIds: ["d1", "d3", "d4"],
  }],
  locations: [{
    id: "imported-safe-house",
    canonicalName: "SAFE HOUSE",
    displayName: "SAFEHOUSE",
    interiorExteriorUsages: ["INT"],
    sceneIds: ["s3"],
  }],
  blocks: [
    block("act1", "new_act", "ACT ONE"),
    block("s1", "scene_heading", "INT. GARAGE - NIGHT", { Number: "1" }),
    block("a1", "action", "Mara, a wary mechanic in a blood-stained uniform, grabs a gun and phone beside the car while a dog and crowd gather. A hologram flickers. An alarm blasts."),
    block("c1", "character", "MARA"),
    block("d1", "dialogue", "We leave tonight, before anyone can trace the signal or discover why the old map was hidden inside the phone."),
    block("c2", "character", "DELL"),
    block("d2", "dialogue", "Then drive."),
    block("beat1", "note", "Escape with the phone"),
    block("s2", "scene_heading", "EXT. ROAD - DAY"),
    block("a2", "action", "Dell drives the car. The dog jumps as the car crashes in an explosion."),
    block("c3", "character", "DELL (O.S.)"),
    block("d2b", "dialogue", "Hold on."),
    block("act2", "new_act", "ACT TWO"),
    block("s3", "scene_heading", "INT. SAFEHOUSE - NIGHT"),
    block("a3", "action", "Mara reads the file and holds the gun."),
    block("c4", "character", "M. VALE (V.O.)"),
    block("d3", "dialogue", "Every promise led us here, and every warning we ignored now points toward the one person we trusted with everything."),
    block("beat2", "note", "Reveal the traitor"),
    block("s4", "scene_heading", "EXT. ROOFTOP - NIGHT"),
    block("a4", "action", "The gun waits on the ledge."),
    block("c5", "character", "MARA"),
    block("d4", "dialogue", "It ends here."),
  ],
};

test("character, location, and object profiles retain deterministic story context", () => {
  const characters = analyzeCharacters(document);
  const mara = characters.find((character) => character.name === "MARA");
  assert.ok(mara);
  assert.deepEqual(mara.aliases, ["M. VALE"]);
  assert.deepEqual(mara.sceneNumbers, [1, 3, 4]);
  assert.deepEqual(mara.absenceGaps, [{ afterScene: 1, beforeScene: 3, scenesAbsent: 1 }]);
  assert.equal(mara.cueCount, 3);
  assert.equal(mara.dialogueCount, 3);
  assert.match(mara.firstDescription ?? "", /wary mechanic/);
  assert.ok(mara.cueVariants.includes("M. VALE (V.O.)"));
  assert.deepEqual(mara.coAppearances[0], { character: "DELL", count: 1, sceneNumbers: [1] });
  assert.equal(mara.dialogueLines[1].blockId, "d3");

  const locations = analyzeLocations(document);
  const safeHouse = locations.find((location) => location.name === "SAFE HOUSE");
  assert.ok(safeHouse);
  assert.deepEqual(safeHouse.aliases, ["SAFEHOUSE"]);
  assert.deepEqual(safeHouse.interiorExterior, ["INT"]);
  assert.deepEqual(safeHouse.timesOfDay, ["NIGHT"]);

  const objects = analyzeObjects(document, characters);
  const gun = objects.find((object) => object.name === "GUN");
  assert.ok(gun);
  assert.deepEqual(gun.sceneNumbers, [1, 3, 4]);
  assert.equal(gun.firstMention?.blockId, "a1");
  assert.equal(gun.lastMention?.blockId, "a4");
  assert.equal(gun.likelyOwner, "MARA");
  assert.equal(gun.productionCategory, "weapons");
  assert.equal(gun.continuity.length, 3);
});

test("entity overrides confirm, reject, rename, merge, and split without mutating recognition output", () => {
  const characters = analyzeCharacters(document);
  const entities: AnalysisEntities = { characters, locations: analyzeLocations(document), objects: analyzeObjects(document, characters) };
  const before = JSON.stringify(entities);
  const overrides: EntityOverride[] = [
    { action: "confirm", kind: "character", entityId: "character-mara" },
    { action: "reject", kind: "location", entityId: "location-rooftop" },
    { action: "rename", kind: "character", entityId: "character-dell", name: "Dell Carter" },
    { action: "merge", kind: "object", entityId: "object-phone", targetId: "object-gun" },
    { action: "split", kind: "character", entityId: "character-mara", newId: "character-rooftop-mara", name: "Rooftop Mara", sceneNumbers: [4] },
  ];
  const changed = applyEntityOverrides(entities, overrides);

  assert.equal(JSON.stringify(entities), before);
  assert.equal(changed.characters.find((character) => character.id === "character-mara")?.status, "confirmed");
  assert.deepEqual(changed.characters.find((character) => character.id === "character-mara")?.sceneNumbers, [1, 3]);
  assert.deepEqual(changed.characters.find((character) => character.id === "character-rooftop-mara")?.sceneNumbers, [4]);
  assert.equal(changed.characters.find((character) => character.id === "character-dell")?.name, "DELL CARTER");
  assert.equal(changed.objects.find((object) => object.id === "object-phone")?.mergedInto, "object-gun");
  assert.ok(changed.objects.find((object) => object.id === "object-gun")?.aliases.includes("PHONE"));
  assert.equal(changed.locations.find((location) => location.id === "location-rooftop")?.status, "rejected");
});

test("compiler supplies structure, coverage, warnings, revisions, and every production report", () => {
  const report = compileAnalysis(document, {
    resolvedBeatIds: ["beat1"],
    plotThreads: [{ id: "escape", label: "Escape", sceneIds: ["s1"], beatIds: ["missing-beat"], keywords: ["phone"] }],
    treatmentSections: [{ id: "safe-house", label: "Safe House", sceneIds: ["s3"] }],
    revision: {
      fromLabel: "Blue",
      toLabel: "Pink",
      changes: [
        { kind: "edited", scene: "INT. GARAGE - NIGHT", summary: "Garage revised." },
        { kind: "added", scene: "EXT. ROOFTOP - NIGHT", summary: "Rooftop added." },
      ],
    },
  });

  assert.equal(report.scenes.length, 4);
  assert.equal(report.scenes[0].sceneNumber, "1");
  assert.equal(report.structure.acts.length, 2);
  assert.equal(report.structure.sequences.length, 2);
  assert.equal(report.structure.beats.length, 2);
  assert.deepEqual(report.unresolvedBeats.map((beat) => beat.id), ["beat2"]);
  assert.equal(report.episode.title, "Signal Fire");
  assert.ok(report.characterArcs.some((arc) => arc.character === "MARA" && arc.actPresence.length === 2));
  assert.equal(report.plotThreads[0].status, "partial");
  assert.equal(report.treatmentCoverage[0].status, "covered");
  assert.equal(report.revision?.counts.edited, 1);
  assert.equal(report.revision?.counts.added, 1);
  assert.ok(report.pacingWarnings.some((warning) => warning.code === "dialogue-heavy"));

  const categories: ProductionCategory[] = ["cast", "locations", "props", "vehicles", "animals", "weapons", "stunts", "vfx", "sfx", "wardrobe", "makeup", "nightScenes", "crowdScenes", "highComplexityScenes"];
  assert.deepEqual(Object.keys(report.production), categories);
  assert.ok(report.production.animals.length > 0);
  assert.ok(report.production.highComplexityScenes.length > 0);
  assert.match(analysisToMarkdown(report), /## Production/);
  assert.match(analysisToCsv(report, "production"), /^category,scene,heading,item,evidence/m);
  assert.equal(JSON.parse(analysisToJson(report)).title, "Signal Fire");
});

test("compiler uses the editable project hierarchy when supplied", () => {
  const report = compileAnalysis(document, {
    storyStructure: {
      acts: [{ id: "custom-act", title: "Custom Act" }],
      sequences: [{ id: "custom-sequence", actId: "custom-act", title: "Custom Sequence", sceneIds: ["s1", "s2", "s3", "s4"] }],
      beats: [{ id: "custom-beat", text: "Custom beat", sequenceId: "custom-sequence", status: "complete", moments: [] }],
      sceneOrder: ["s1", "s2", "s3", "s4"],
    },
  });
  assert.equal(report.structure.acts[0].title, "Custom Act");
  assert.equal(report.structure.sequences[0].title, "Custom Sequence");
  assert.equal(report.structure.beats[0].status, "resolved");
});
