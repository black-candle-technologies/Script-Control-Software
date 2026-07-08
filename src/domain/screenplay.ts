/**
 * The screenplay document model — the heart of the writing workspace.
 *
 * A screenplay is a flat list of typed blocks (scene headings, action,
 * character cues, dialogue, ...). Scenes, characters and locations are always
 * *derived* from the blocks rather than stored, so the text can never drift
 * out of sync with the structure panels.
 */

export type ScreenplayElementType =
  | "scene_heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "shot"
  | "note";

export interface ScreenplayBlock {
  id: string;
  type: ScreenplayElementType;
  text: string;
}

export interface TitlePage {
  title: string;
  author: string;
}

export interface ScreenplayDocument {
  titlePage: TitlePage;
  blocks: ScreenplayBlock[];
  /** Free-form notes keyed by the scene-heading block id. */
  sceneNotes: Record<string, string>;
}

/** Order used by Tab / Shift+Tab cycling and the element selector. */
export const ELEMENT_TYPES: ScreenplayElementType[] = [
  "scene_heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "shot",
  "note",
];

export const elementLabels: Record<ScreenplayElementType, string> = {
  scene_heading: "Scene Heading",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  transition: "Transition",
  shot: "Shot",
  note: "Note",
};

/**
 * What Enter creates after each element — the classic screenwriting flow:
 * heading → action, character → dialogue, dialogue → character (for quick
 * back-and-forth), transition → new scene.
 */
export const enterCreates: Record<ScreenplayElementType, ScreenplayElementType> = {
  scene_heading: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "character",
  transition: "scene_heading",
  shot: "action",
  note: "action",
};

let counter = 0;
export function newBlock(type: ScreenplayElementType, text = ""): ScreenplayBlock {
  // ponytail: counter-suffixed id; collision-proof enough for a single local session
  return { id: `b${Date.now().toString(36)}${(counter++).toString(36)}`, type, text };
}

export function emptyDocument(title = "Untitled Screenplay"): ScreenplayDocument {
  return {
    titlePage: { title, author: "" },
    blocks: [newBlock("scene_heading")],
    sceneNotes: {},
  };
}

/* ---- Derived structure ------------------------------------------------- */

export interface Scene {
  /** Id of the scene-heading block that opens the scene. */
  id: string;
  /** 1-based scene number. */
  number: number;
  heading: string;
  /** Index of the heading block in the document. */
  blockIndex: number;
  /** Character names cued inside this scene. */
  characters: string[];
}

export interface CharacterRef {
  name: string;
  /** Number of dialogue cues. */
  cueCount: number;
  /** Scene number of the first appearance. */
  firstScene: number;
}

export interface LocationRef {
  name: string;
  intExt: string[];
  sceneNumbers: number[];
}

/** Strip cue extensions like (V.O.), (O.S.), (CONT'D) and dual-dialogue `^`. */
export function normalizeCharacterName(cue: string): string {
  return cue
    .replace(/\(.*?\)/g, "")
    .replace(/\^\s*$/, "")
    .trim()
    .toUpperCase();
}

const HEADING_RE = /^(INT|EXT|EST|INT\/EXT|I\/E)[.\s]/i;

export interface ParsedHeading {
  intExt: string;
  location: string;
  timeOfDay: string;
}

/** Split "INT. HOUSE - NIGHT" into its parts. Best-effort; never throws. */
export function parseHeading(heading: string): ParsedHeading {
  const m = heading.match(/^(INT\/EXT|I\/E|INT|EXT|EST)[.\s]+(.*)$/i);
  const rest = m ? m[2] : heading;
  const dash = rest.lastIndexOf(" - ");
  return {
    intExt: m ? m[1].toUpperCase() : "",
    location: (dash >= 0 ? rest.slice(0, dash) : rest).trim().toUpperCase(),
    timeOfDay: dash >= 0 ? rest.slice(dash + 3).trim().toUpperCase() : "",
  };
}

export function deriveScenes(blocks: ScreenplayBlock[]): Scene[] {
  const scenes: Scene[] = [];
  let current: Scene | null = null;
  blocks.forEach((block, i) => {
    if (block.type === "scene_heading") {
      current = {
        id: block.id,
        number: scenes.length + 1,
        heading: block.text.trim().toUpperCase() || "(empty scene heading)",
        blockIndex: i,
        characters: [],
      };
      scenes.push(current);
    } else if (block.type === "character" && current) {
      const name = normalizeCharacterName(block.text);
      if (name && !current.characters.includes(name)) current.characters.push(name);
    }
  });
  return scenes;
}

export function deriveCharacters(blocks: ScreenplayBlock[]): CharacterRef[] {
  const map = new Map<string, CharacterRef>();
  let sceneNumber = 0;
  for (const block of blocks) {
    if (block.type === "scene_heading") sceneNumber++;
    if (block.type !== "character") continue;
    const name = normalizeCharacterName(block.text);
    if (!name) continue;
    const existing = map.get(name);
    if (existing) existing.cueCount++;
    else map.set(name, { name, cueCount: 1, firstScene: Math.max(sceneNumber, 1) });
  }
  return [...map.values()].sort((a, b) => b.cueCount - a.cueCount);
}

export function deriveLocations(blocks: ScreenplayBlock[]): LocationRef[] {
  const map = new Map<string, LocationRef>();
  let sceneNumber = 0;
  for (const block of blocks) {
    if (block.type !== "scene_heading") continue;
    sceneNumber++;
    const { intExt, location } = parseHeading(block.text.trim());
    if (!location) continue;
    const existing = map.get(location);
    if (existing) {
      existing.sceneNumbers.push(sceneNumber);
      if (intExt && !existing.intExt.includes(intExt)) existing.intExt.push(intExt);
    } else {
      map.set(location, { name: location, intExt: intExt ? [intExt] : [], sceneNumbers: [sceneNumber] });
    }
  }
  return [...map.values()];
}

export function countWords(blocks: ScreenplayBlock[]): number {
  return blocks.reduce(
    (n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0),
    0,
  );
}

/** Characters per line for each element at standard screenplay margins. */
const LINE_WIDTH: Record<ScreenplayElementType, number> = {
  scene_heading: 60,
  action: 60,
  character: 34,
  dialogue: 35,
  parenthetical: 30,
  transition: 60,
  shot: 60,
  note: 60,
};

/**
 * Rough page estimate: sum wrapped lines plus inter-block spacing at ~55 lines
 * per page. Not pagination — just an honest ballpark for the status bar.
 */
export function estimatePages(blocks: ScreenplayBlock[]): number {
  let lines = 0;
  for (const b of blocks) {
    const width = LINE_WIDTH[b.type];
    for (const line of b.text.split("\n")) {
      lines += Math.max(1, Math.ceil(line.length / width));
    }
    lines += 1; // blank line between elements
  }
  return Math.max(1, Math.ceil(lines / 55));
}

export function isSceneHeadingText(text: string): boolean {
  return HEADING_RE.test(text.trim());
}

export function isTransitionText(text: string): boolean {
  const t = text.trim();
  if (t !== t.toUpperCase()) return false;
  return /TO:$/.test(t) || /^FADE (OUT|TO BLACK)[.:]?$/.test(t);
}
