import type { CoverageHook, EntityOverride } from "./analysis.ts";
import type { PageLock, RevisionSet } from "./revisionProduction.ts";

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
  | "note"
  | "general"
  | "lyrics"
  | "cast_list"
  | "new_act"
  | "end_of_act"
  | "unknown";

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeout: boolean;
  revisionId?: string;
  metadata: Record<string, string>;
}

export interface ScreenplayBlock {
  id: string;
  type: ScreenplayElementType;
  text: string;
  textRuns?: TextRun[];
  sceneId?: string;
  originalType?: string;
  metadata?: Record<string, string>;
}

export interface TitlePage {
  title: string;
  author: string;
  blocks?: { type: string; text: string; metadata: Record<string, string> }[];
}

export interface ScreenplayDocument {
  id?: string;
  title?: string;
  source?: ScriptSource;
  metadata?: Record<string, string>;
  titlePage: TitlePage;
  blocks: ScreenplayBlock[];
  scenes?: ImportedScene[];
  characters?: ImportedCharacter[];
  locations?: ImportedLocation[];
  warnings?: ImportWarning[];
  readOnly?: boolean;
  /** Free-form notes keyed by the scene-heading block id. */
  sceneNotes: Record<string, string>;
  workspace?: WorkspaceData;
}

export type StoryBoardView = "act" | "sequence" | "scene" | "beat" | "timeline";

export interface CustomStoryStructure {
  acts: { id: string; title: string }[];
  sequences: { id: string; actId: string; title: string; sceneIds: string[] }[];
  beats: { id: string; text: string; sceneId?: string; sequenceId?: string; status: "idea" | "drafted" | "complete"; moments: { id: string; text: string }[] }[];
  sceneOrder: string[];
}

export interface TreatmentDocument {
  id: string;
  title: string;
  markdown: string;
  links: { id: string; targetType: "act" | "sequence" | "scene" | "beat" | "character" | "object" | "location"; targetId: string; label: string }[];
}

/** Portable development metadata kept beside the screenplay, never inside FDX. */
export interface WorkspaceData {
  treatment: string;
  treatments?: TreatmentDocument[];
  activeTreatmentId?: string;
  storyStructure?: CustomStoryStructure;
  storyBoardView?: StoryBoardView;
  showBible: string;
  continuity: string;
  seasonArc: string;
  productionNotes: string;
  productionDraftLabel?: string;
  revisionColor?: string;
  lockedPages?: string;
  revisionSets?: RevisionSet[];
  activeRevisionId?: string;
  pageLock?: PageLock;
  shootingEighthsPerDay?: number;
  omittedSceneIds?: string[];
  sceneMeta?: Record<string, { summary: string; tags: string; status: "outline" | "draft" | "revised" | "locked" }>;
  comments: { id: string; author: string; text: string; resolved: boolean; createdAt: string }[];
  entityStatuses: Record<string, "detected" | "confirmed" | "rejected">;
  entityOverrides?: EntityOverride[];
  entityNotes?: Record<string, string>;
  resolvedBeatIds?: string[];
  plotThreads?: CoverageHook[];
}

export const emptyWorkspace = (): WorkspaceData => ({
  treatment: "",
  treatments: [],
  storyBoardView: "scene",
  showBible: "",
  continuity: "",
  seasonArc: "",
  productionNotes: "",
  productionDraftLabel: "First Draft",
  revisionColor: "White",
  lockedPages: "",
  revisionSets: [],
  activeRevisionId: "",
  pageLock: undefined,
  shootingEighthsPerDay: 40,
  omittedSceneIds: [],
  sceneMeta: {},
  comments: [],
  entityStatuses: {},
  entityOverrides: [],
  entityNotes: {},
  resolvedBeatIds: [],
  plotThreads: [],
});

export interface ScriptSource {
  type: "fdx" | "fountain" | "native";
  path: string;
  fileName: string;
  fdxVersion?: string;
  lastImportedAt: string;
}

export interface ImportWarning {
  code: string;
  message: string;
  blockIndex?: number;
  severity: "info" | "warning" | "error";
  dataPreserved: boolean;
}

export interface ImportedScene {
  id: string;
  sceneNumber?: string;
  heading: string;
  interiorExterior?: string;
  location?: string;
  timeOfDay?: string;
  blockStart: number;
  blockEnd: number;
  characterIds: string[];
  metadata: Record<string, string>;
}

export interface ImportedCharacter {
  id: string;
  canonicalName: string;
  displayName: string;
  aliases: string[];
  firstAppearanceBlockId: string;
  sceneIds: string[];
  dialogueBlockIds: string[];
}

export interface ImportedLocation {
  id: string;
  canonicalName: string;
  displayName: string;
  interiorExteriorUsages: string[];
  sceneIds: string[];
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
  general: "General",
  lyrics: "Lyrics",
  cast_list: "Cast List",
  new_act: "New Act",
  end_of_act: "End of Act",
  unknown: "Unsupported",
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
  general: "action",
  lyrics: "action",
  cast_list: "action",
  new_act: "action",
  end_of_act: "action",
  unknown: "action",
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
    workspace: emptyWorkspace(),
  };
}

/* ---- Derived structure ------------------------------------------------- */

export interface Scene {
  /** Id of the scene-heading block that opens the scene. */
  id: string;
  /** 1-based scene number. */
  number: number;
  sceneNumber?: string;
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

const HEADING_RE = /^(?:INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E|INT|EXT|EST)[.\s]/i;

export interface ParsedHeading {
  intExt: string;
  location: string;
  timeOfDay: string;
}

/** Split "INT. HOUSE - NIGHT" into its parts. Best-effort; never throws. */
export function parseHeading(heading: string): ParsedHeading {
  const m = heading.match(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E|INT|EXT|EST)[.\s]+(.*)$/i);
  const rest = m ? m[2] : heading;
  const dash = rest.lastIndexOf(" - ");
  return {
    intExt: m ? m[1].replace(/\./g, "").toUpperCase() : "",
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
        sceneNumber: block.metadata?.Number,
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

/** Preserve scene-linked development data when a parser regenerates block ids. */
export function reconcileSceneMetadata(previous: ScreenplayDocument, parsed: ScreenplayDocument): ScreenplayDocument {
  const before = deriveScenes(previous.blocks);
  const blocks = reconcileBlockIds(previous.blocks, parsed.blocks);
  const after = deriveScenes(blocks);
  const remap = new Map<string, string>();
  const available = new Set(after.map((scene) => scene.id));
  const byIdentity = sceneIdentityMap(after);
  for (const [index, scene] of before.entries()) {
    const same = byIdentity.get(sceneIdentity(before, index))?.find((candidate) => available.has(candidate));
    const fallback = after[index]?.id;
    const nextId = same ?? (fallback && available.has(fallback) ? fallback : undefined);
    if (nextId) {
      remap.set(scene.id, nextId);
      available.delete(nextId);
    }
  }
  const remapRecord = <T>(record: Record<string, T> | undefined) => Object.fromEntries(
    Object.entries(record ?? {}).flatMap(([id, value]) => remap.has(id) ? [[remap.get(id)!, value] as const] : []),
  );
  const workspace = { ...emptyWorkspace(), ...previous.workspace, ...parsed.workspace };
  workspace.sceneMeta = remapRecord(previous.workspace?.sceneMeta);
  workspace.omittedSceneIds = (previous.workspace?.omittedSceneIds ?? []).flatMap((id) => remap.get(id) ?? []);
  return { ...previous, ...parsed, blocks, sceneNotes: remapRecord(previous.sceneNotes), workspace };
}

function reconcileBlockIds(previous: ScreenplayBlock[], parsed: ScreenplayBlock[]): ScreenplayBlock[] {
  const available = new Set(previous.map((block) => block.id));
  return parsed.map((block, index) => {
    const samePosition = previous[index];
    const match = samePosition && available.has(samePosition.id) && samePosition.type === block.type && samePosition.text === block.text
      ? samePosition
      : previous.find((candidate) => available.has(candidate.id) && candidate.type === block.type && candidate.text === block.text);
    if (!match) return block;
    available.delete(match.id);
    return { ...block, id: match.id };
  });
}

function sceneIdentity(scenes: Scene[], index: number): string {
  const heading = scenes[index].heading.trim().toUpperCase();
  let occurrence = 0;
  for (let i = 0; i <= index; i++) if (scenes[i].heading.trim().toUpperCase() === heading) occurrence++;
  return `${heading}\0${occurrence}`;
}

function sceneIdentityMap(scenes: Scene[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  scenes.forEach((scene, index) => {
    const identity = sceneIdentity(scenes, index);
    map.set(identity, [...(map.get(identity) ?? []), scene.id]);
  });
  return map;
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
  general: 60,
  lyrics: 35,
  cast_list: 60,
  new_act: 60,
  end_of_act: 60,
  unknown: 60,
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

/** Group whole screenplay elements onto estimated 55-line pages for visible page boundaries. */
export function paginateBlocks(blocks: ScreenplayBlock[]): ScreenplayBlock[][] {
  const pages: ScreenplayBlock[][] = [[]];
  let lines = 0;
  for (const block of blocks) {
    const blockLines = block.text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / LINE_WIDTH[block.type])), 1);
    if (lines && lines + blockLines > 55) {
      pages.push([]);
      lines = 0;
    }
    pages[pages.length - 1].push(block);
    lines += blockLines;
  }
  return pages;
}

export function isSceneHeadingText(text: string): boolean {
  return HEADING_RE.test(text.trim());
}

export function isTransitionText(text: string): boolean {
  const t = text.trim();
  if (t !== t.toUpperCase()) return false;
  return /TO:$/.test(t) || /^FADE (OUT|TO BLACK)[.:]?$/.test(t);
}
