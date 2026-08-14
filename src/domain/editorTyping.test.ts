import { test } from "node:test";
import assert from "node:assert/strict";

import { sceneHeadingCompletion, typeAfterDialogueEnter } from "./editorTyping.ts";
import type { ScreenplayBlock } from "./screenplay.ts";

const heading = (id: string, text: string): ScreenplayBlock => ({ id, type: "scene_heading", text });

test("scene heading completion advances through prefixes, prior locations, separator, and times", () => {
  const blocks = [
    heading("one", "INT. KITCHEN - DAWN"),
    heading("two", "EXT. ROOF - NIGHT"),
    heading("active", ""),
  ];

  assert.deepEqual(sceneHeadingCompletion(blocks, "active", ""), {
    stage: "prefix",
    base: "",
    candidates: ["INT.", "EXT.", "I/E."],
  });
  assert.deepEqual(sceneHeadingCompletion(blocks, "active", "INT. "), {
    stage: "location",
    base: "INT. ",
    candidates: ["KITCHEN", "ROOF"],
  });
  assert.deepEqual(sceneHeadingCompletion(blocks, "active", "INT. KIT"), {
    stage: "location",
    base: "INT. ",
    candidates: ["KITCHEN"],
  });
  assert.deepEqual(sceneHeadingCompletion(blocks, "active", "INT. KITCHEN"), {
    stage: "separator",
    base: "INT. KITCHEN",
    candidates: [" - "],
  });
  assert.deepEqual(sceneHeadingCompletion(blocks, "active", "INT. KITCHEN - "), {
    stage: "time",
    base: "INT. KITCHEN - ",
    candidates: ["DAY", "NIGHT", "CONTINUOUS", "DAWN"],
  });
});

test("scene heading completion excludes the active heading from its history", () => {
  const blocks = [heading("active", "INT. NEW PLACE - MAGIC HOUR")];
  assert.deepEqual(sceneHeadingCompletion(blocks, "active", "INT. "), {
    stage: "location",
    base: "INT. ",
    candidates: [],
  });
});

test("dialogue returns to action after one turn and character after an exchange", () => {
  const oneTurn: ScreenplayBlock[] = [
    { id: "c1", type: "character", text: "MARA" },
    { id: "d1", type: "dialogue", text: "Hello." },
  ];
  assert.equal(typeAfterDialogueEnter(oneTurn, 1), "action");

  const exchange: ScreenplayBlock[] = [
    ...oneTurn,
    { id: "c2", type: "character", text: "DELL" },
    { id: "p2", type: "parenthetical", text: "(quietly)" },
    { id: "d2", type: "dialogue", text: "Hi." },
  ];
  assert.equal(typeAfterDialogueEnter(exchange, 4), "character");

  const interrupted: ScreenplayBlock[] = [
    ...oneTurn,
    { id: "a", type: "action", text: "A door closes." },
    { id: "c2", type: "character", text: "DELL" },
    { id: "d2", type: "dialogue", text: "Hi." },
  ];
  assert.equal(typeAfterDialogueEnter(interrupted, 4), "action");
});
