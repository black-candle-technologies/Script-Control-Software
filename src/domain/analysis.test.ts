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
  createManualObjectOverride,
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
  const firstDialogue = mara.dialogueLines[0];
  assert.deepEqual({
    blockId: firstDialogue.blockId,
    startOffset: firstDialogue.startOffset,
    endOffset: firstDialogue.endOffset,
    matchedText: firstDialogue.matchedText,
    occurrence: firstDialogue.occurrence,
  }, {
    blockId: "d1",
    startOffset: 0,
    endOffset: firstDialogue.text.length,
    matchedText: firstDialogue.text,
    occurrence: 0,
  });

  const locations = analyzeLocations(document);
  const safeHouse = locations.find((location) => location.name === "SAFE HOUSE");
  assert.ok(safeHouse);
  assert.deepEqual(safeHouse.aliases, ["SAFEHOUSE"]);
  assert.deepEqual(safeHouse.interiorExterior, ["INT"]);
  assert.deepEqual(safeHouse.timesOfDay, ["NIGHT"]);
  assert.deepEqual({
    blockId: safeHouse.appearances[0].blockId,
    startOffset: safeHouse.appearances[0].startOffset,
    endOffset: safeHouse.appearances[0].endOffset,
    matchedText: safeHouse.appearances[0].matchedText,
    occurrence: safeHouse.appearances[0].occurrence,
  }, {
    blockId: "s3",
    startOffset: 5,
    endOffset: 14,
    matchedText: "SAFEHOUSE",
    occurrence: 0,
  });

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

test("object continuity retains exact capture offsets for punctuation, plurals, and repeated mentions", () => {
  const text = "A knife, then KNIVES; another knife.";
  const profiles = analyzeObjects([
    block("scene-exact", "scene_heading", "INT. WORKSHOP - NIGHT"),
    block("action-exact", "action", text),
  ]);
  const knife = profiles.find((profile) => profile.name === "KNIFE");
  assert.ok(knife);
  assert.equal(knife.continuity.length, 1);
  assert.equal(knife.continuity[0].mentionCount, 3);
  assert.deepEqual(knife.continuity[0].occurrences, [
    { startOffset: text.indexOf("knife"), endOffset: text.indexOf("knife") + 5, matchedText: "knife", occurrence: 0 },
    { startOffset: text.indexOf("KNIVES"), endOffset: text.indexOf("KNIVES") + 6, matchedText: "KNIVES", occurrence: 1 },
    { startOffset: text.lastIndexOf("knife"), endOffset: text.lastIndexOf("knife") + 5, matchedText: "knife", occurrence: 2 },
  ]);
  for (const occurrence of knife.continuity[0].occurrences) {
    assert.equal(text.slice(occurrence.startOffset, occurrence.endOffset), occurrence.matchedText);
  }
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

test("manual object overrides add arbitrary props and reuse matching recognized entities", () => {
  const characters = analyzeCharacters(document);
  const entities: AnalysisEntities = { characters, locations: analyzeLocations(document), objects: analyzeObjects(document, characters) };
  const before = JSON.stringify(entities);
  const locketOverride = createManualObjectOverride("  Hero's Locket  ", " wardrobe ");

  assert.deepEqual(locketOverride, {
    action: "add",
    kind: "object",
    entityId: "object-hero-s-locket",
    name: "HERO'S LOCKET",
    category: "wardrobe",
  });
  const changed = applyEntityOverrides(entities, [locketOverride, locketOverride]);
  const locket = changed.objects.find((object) => object.id === locketOverride.entityId);
  assert.equal(JSON.stringify(entities), before);
  assert.equal(changed.objects.filter((object) => object.id === locketOverride.entityId).length, 1);
  assert.equal(locket?.name, "HERO'S LOCKET");
  assert.equal(locket?.status, "confirmed");
  assert.equal(locket?.category, "wardrobe");
  assert.equal(locket?.productionCategory, "wardrobe");
  assert.equal(locket?.confidence, 1);
  assert.deepEqual(locket?.sceneNumbers, []);

  const reused = applyEntityOverrides(entities, [createManualObjectOverride("gun", "prop")]);
  assert.equal(reused.objects.filter((object) => object.id === "object-gun").length, 1);
  assert.equal(reused.objects.find((object) => object.id === "object-gun")?.status, "confirmed");
  assert.equal(reused.objects.find((object) => object.id === "object-gun")?.productionCategory, "props");
  assert.ok(compileAnalysis(document, { entityOverrides: [locketOverride] }).entities.objects.some((object) => object.name === "HERO'S LOCKET"));
  assert.notEqual(createManualObjectOverride("C++").entityId, createManualObjectOverride("C#").entityId);
  assert.throws(() => createManualObjectOverride("   "), /Object name is required/);
});

test("CSV export neutralizes formula-leading screenplay text", () => {
  const hostile = structuredClone(document);
  hostile.title = "=2+2";
  const csv = analysisToCsv(compileAnalysis(hostile), "summary");
  assert.match(csv, /'=2\+2/);
  assert.doesNotMatch(csv, /(?:^|,)\s*=2\+2/m);
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
  assert.equal(report.production.cast.filter((row) => row.item === "MARA").length, 1);
  assert.match(report.production.cast.find((row) => row.item === "MARA")?.evidence ?? "", /3 scene\(s\), 3 cue\(s\), 3 dialogue block\(s\)/);
  assert.equal(new Set(report.production.cast.map((row) => row.item)).size, report.production.cast.length);
  assert.equal(new Set(report.production.locations.map((row) => row.item)).size, report.production.locations.length);
  assert.ok(report.production.props.every((row) => !["GUN", "CAR", "UNIFORM"].includes(row.item)));
  assert.ok(report.production.weapons.some((row) => row.item === "GUN"));
  assert.ok(report.production.vehicles.some((row) => row.item === "CAR"));
  assert.ok(report.production.wardrobe.some((row) => row.item === "UNIFORM"));
  const crashEvidence = report.production.stunts.find((row) => row.item === "CRASH");
  assert.ok(crashEvidence?.occurrences?.length);
  assert.equal(crashEvidence.occurrences[0].blockId, "a2");
  assert.equal(document.blocks.find((block) => block.id === "a2")?.text.slice(
    crashEvidence.occurrences[0].startOffset,
    crashEvidence.occurrences[0].endOffset,
  ), "crashes");
  const castEvidence = report.production.cast.find((row) => row.item === "MARA")?.occurrences?.[0];
  assert.equal(castEvidence?.blockId, "d1");
  assert.equal(castEvidence?.matchedText, document.blocks.find((block) => block.id === "d1")?.text);
  const markdown = analysisToMarkdown(report);
  for (const heading of ["Overview", "Scenes", "Characters", "Character Arcs", "Locations", "Objects and Props", "Acts", "Sequences", "Beats", "Plot Threads", "Treatment Coverage", "Unresolved Beats", "Pacing Warnings", "Revision", "Production"]) {
    assert.match(markdown, new RegExp(`## ${heading}`));
  }
  assert.match(markdown, /Garage revised\./);
  assert.match(markdown, /Escape/);
  assert.match(markdown, /Mara, a wary mechanic/);

  const allCsv = analysisToCsv(report, "all");
  assert.match(allCsv, /^section,record,data/m);
  for (const section of ["summary", "episode", "scenes", "characters", "locations", "objects", "acts", "sequences", "beats", "characterArcs", "plotThreads", "treatmentCoverage", "unresolvedBeats", "pacingWarnings", "revision", "production.cast", "production.highComplexityScenes"]) {
    assert.match(allCsv, new RegExp(`^${section},`, "m"));
  }
  assert.match(allCsv, /Garage revised\./);
  assert.match(analysisToCsv(report, "locations"), /^location,first_scene,last_scene/m);
  assert.match(analysisToCsv(report, "structure"), /^type,id,parent_id/m);
  assert.match(analysisToCsv(report, "arcs"), /^character,first_scene,last_scene/m);
  assert.match(analysisToCsv(report, "coverage"), /^source,id,label,status/m);
  assert.match(analysisToCsv(report, "warnings"), /^source,code_or_id,severity_or_status/m);
  assert.match(analysisToCsv(report, "revision"), /^from,to,total,added/m);
  assert.match(analysisToCsv(report, "production"), /^category,scene,heading,item,evidence/m);
  assert.equal(JSON.parse(analysisToJson(report)).title, "Signal Fire");
});

test("production props are unique per scene even when repeated across action blocks", () => {
  const repeated = structuredClone(document);
  repeated.blocks.splice(3, 0,
    block("a1-phone-2", "action", "The phone rings."),
    block("a1-phone-3", "action", "Mara pockets the phone."),
  );

  const report = compileAnalysis(repeated);
  const garagePhones = report.production.props.filter((row) => row.sceneNumber === 1 && row.item === "PHONE");
  assert.equal(garagePhones.length, 1);
  assert.match(garagePhones[0].evidence, /phone rings/i);
  assert.match(garagePhones[0].evidence, /pockets the phone/i);
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
