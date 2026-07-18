import {
  deriveScenes,
  estimatePages,
  normalizeCharacterName,
  parseHeading,
  type CustomStoryStructure,
  type ScreenplayBlock,
  type ScreenplayDocument,
} from "./screenplay.ts";
import { buildStructure, detectObjects, type DraftChange } from "./studio.ts";

export type AnalysisInput = ScreenplayDocument | ScreenplayBlock[];
export type AnalysisEntityKind = "character" | "location" | "object";
export type AnalysisEntityStatus = "detected" | "confirmed" | "rejected" | "merged";

interface AnalysisEntityBase {
  id: string;
  kind: AnalysisEntityKind;
  name: string;
  aliases: string[];
  status: AnalysisEntityStatus;
  mergedInto?: string;
}

export interface CharacterSceneAppearance {
  sceneNumber: number;
  sceneId: string;
  cueCount: number;
  dialogueCount: number;
  dialogueWords: number;
}

export interface DialogueLine {
  sceneNumber: number;
  sceneId: string;
  blockId: string;
  text: string;
}

export interface CharacterProfile extends AnalysisEntityBase {
  kind: "character";
  cueVariants: string[];
  firstScene: number;
  lastScene: number;
  firstDescription?: string;
  cueCount: number;
  dialogueCount: number;
  dialogueWords: number;
  sceneCount: number;
  sceneNumbers: number[];
  appearances: CharacterSceneAppearance[];
  coAppearances: { character: string; count: number; sceneNumbers: number[] }[];
  absenceGaps: { afterScene: number; beforeScene: number; scenesAbsent: number }[];
  dialogueLines: DialogueLine[];
}

export interface LocationAppearance {
  sceneNumber: number;
  sceneId: string;
  heading: string;
  interiorExterior: string;
  timeOfDay: string;
}

export interface LocationProfile extends AnalysisEntityBase {
  kind: "location";
  firstScene: number;
  lastScene: number;
  sceneCount: number;
  sceneNumbers: number[];
  interiorExterior: string[];
  timesOfDay: string[];
  appearances: LocationAppearance[];
}

export interface ObjectContinuityEntry {
  sceneNumber: number;
  sceneId: string;
  blockId: string;
  mentionCount: number;
  excerpt: string;
  associatedCharacters: string[];
  ownershipCharacters: string[];
}

export interface ObjectAssociation {
  character: string;
  scenes: number[];
  mentions: number;
  ownershipSignals: number;
  reason: "ownership language" | "same action" | "only character in scene";
}

export interface ObjectProfile extends AnalysisEntityBase {
  kind: "object";
  category: string;
  productionCategory: string;
  confidence: number;
  mentions: number;
  firstScene: number;
  lastScene: number;
  sceneNumbers: number[];
  firstMention?: ObjectContinuityEntry;
  lastMention?: ObjectContinuityEntry;
  likelyOwner?: string;
  associations: ObjectAssociation[];
  continuity: ObjectContinuityEntry[];
}

export interface AnalysisEntities {
  characters: CharacterProfile[];
  locations: LocationProfile[];
  objects: ObjectProfile[];
}

export type EntityOverride =
  | { action: "confirm" | "reject"; kind: AnalysisEntityKind; entityId: string }
  | { action: "rename"; kind: AnalysisEntityKind; entityId: string; name: string }
  | { action: "merge"; kind: AnalysisEntityKind; entityId: string; targetId: string }
  | { action: "split"; kind: AnalysisEntityKind; entityId: string; newId: string; name: string; sceneNumbers: number[] };

export interface CoverageHook {
  id: string;
  label: string;
  sceneIds?: readonly string[];
  beatIds?: readonly string[];
  keywords?: readonly string[];
  resolved?: boolean;
}

export interface RevisionSummaryInput {
  fromLabel?: string;
  toLabel?: string;
  changes: readonly DraftChange[];
}

export interface CompileAnalysisOptions {
  episodeTitle?: string;
  entityOverrides?: readonly EntityOverride[];
  plotThreads?: readonly CoverageHook[];
  treatmentSections?: readonly CoverageHook[];
  resolvedBeatIds?: readonly string[];
  revision?: RevisionSummaryInput;
  storyStructure?: CustomStoryStructure;
}

export interface SceneAnalysisRow {
  id: string;
  number: number;
  sceneNumber?: string;
  heading: string;
  interiorExterior: string;
  location: string;
  timeOfDay: string;
  blockStart: number;
  blockEnd: number;
  blockCount: number;
  wordCount: number;
  dialogueWords: number;
  dialogueDensity: number;
  estimatedEighths: number;
  estimatedPages: number;
  characters: string[];
  objects: string[];
  complexityScore: number;
}

export interface BeatSummary {
  id: string;
  text: string;
  sceneId: string;
  sceneNumber?: number;
  status: "resolved" | "unresolved";
}

export interface StructureAnalysis {
  acts: { id: string; title: string; sceneIds: string[]; sceneCount: number; estimatedPages: number; summary: string }[];
  sequences: { id: string; actId: string; title: string; sceneIds: string[]; sceneCount: number; estimatedPages: number; summary: string }[];
  beats: BeatSummary[];
}

export interface CoverageResult {
  id: string;
  label: string;
  matchedSceneIds: string[];
  matchedBeatIds: string[];
  missingSceneIds: string[];
  missingBeatIds: string[];
  status: "covered" | "partial" | "uncovered";
  resolved?: boolean;
}

export interface CharacterArc {
  character: string;
  firstScene: number;
  lastScene: number;
  actPresence: string[];
  dialogueTrend: "rising" | "steady" | "falling";
  firstDescription?: string;
  summary: string;
}

export type ProductionCategory =
  | "cast"
  | "locations"
  | "props"
  | "vehicles"
  | "animals"
  | "weapons"
  | "stunts"
  | "vfx"
  | "sfx"
  | "wardrobe"
  | "makeup"
  | "nightScenes"
  | "crowdScenes"
  | "highComplexityScenes";

export interface ProductionRow {
  category: ProductionCategory;
  sceneNumber: number;
  sceneId: string;
  heading: string;
  item: string;
  evidence: string;
  blockId?: string;
}

export type ProductionReport = Record<ProductionCategory, ProductionRow[]>;

export interface AnalysisWarning {
  code: "dialogue-heavy" | "action-heavy" | "long-scene" | "short-scene-run" | "uneven-scene-length";
  severity: "info" | "warning";
  message: string;
  sceneNumber?: number;
}

export interface RevisionSummary {
  fromLabel?: string;
  toLabel?: string;
  total: number;
  counts: Record<DraftChange["kind"], number>;
  changes: DraftChange[];
}

export interface ScriptAnalysis {
  title: string;
  scenes: SceneAnalysisRow[];
  pageEstimate: number;
  wordCount: number;
  dialogueWords: number;
  dialogueDensity: number;
  entities: AnalysisEntities;
  structure: StructureAnalysis;
  episode: {
    title: string;
    sceneCount: number;
    pageEstimate: number;
    runtimeMinutes: number;
    actCount: number;
    sequenceCount: number;
    beatCount: number;
    characterCount: number;
    locationCount: number;
    firstScene?: string;
    lastScene?: string;
    summary: string;
  };
  characterArcs: CharacterArc[];
  plotThreads: CoverageResult[];
  treatmentCoverage: CoverageResult[];
  unresolvedBeats: BeatSummary[];
  pacingWarnings: AnalysisWarning[];
  revision?: RevisionSummary;
  production: ProductionReport;
}

interface ResolvedInput {
  document?: ScreenplayDocument;
  blocks: ScreenplayBlock[];
}

function resolveInput(input: AnalysisInput): ResolvedInput {
  return Array.isArray(input) ? { blocks: input } : { document: input, blocks: input.blocks };
}

const words = (text: string) => text.trim().match(/\S+/g)?.length ?? 0;
const blockWords = (blocks: ScreenplayBlock[]) => blocks.reduce((total, block) => total + words(block.text), 0);
const rounded = (value: number, places = 3) => Number(value.toFixed(places));
const unique = (values: Iterable<string>) => [...new Set(values)].filter(Boolean);
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const canonicalId = (kind: AnalysisEntityKind, name: string) => `${kind}-${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed"}`;

function sceneNumbersByBlock(blocks: ScreenplayBlock[]): number[] {
  const result: number[] = [];
  let scene = 0;
  for (const block of blocks) {
    if (block.type === "scene_heading") scene++;
    result.push(Math.max(scene, 1));
  }
  return result;
}

function absenceGaps(sceneNumbers: number[]) {
  return sceneNumbers.slice(1).flatMap((scene, index) => {
    const previous = sceneNumbers[index];
    return scene - previous > 1 ? [{ afterScene: previous, beforeScene: scene, scenesAbsent: scene - previous - 1 }] : [];
  });
}

function nearbyDescription(blocks: ScreenplayBlock[], cueIndex: number, names: string[]): string | undefined {
  let start = cueIndex;
  while (start > 0 && blocks[start].type !== "scene_heading") start--;
  let end = cueIndex + 1;
  while (end < blocks.length && blocks[end].type !== "scene_heading") end++;
  const candidates = blocks.slice(start, end).map((block, offset) => ({ block, index: start + offset }))
    .filter(({ block }) => block.type === "action" && block.text.trim());
  const mentionsName = ({ block }: (typeof candidates)[number]) => names.some((name) => new RegExp(`(?:^|[^A-Z0-9])${escaped(name)}(?:$|[^A-Z0-9])`, "i").test(block.text));
  const closest = (items: typeof candidates) => [...items].sort((a, b) => Math.abs(a.index - cueIndex) - Math.abs(b.index - cueIndex))[0]?.block.text.trim();
  return closest(candidates.filter((candidate) => candidate.index <= cueIndex && mentionsName(candidate)))
    ?? closest(candidates.filter(mentionsName))
    ?? closest(candidates.filter((candidate) => Math.abs(candidate.index - cueIndex) <= 3));
}

export function analyzeCharacters(input: AnalysisInput): CharacterProfile[] {
  const { document, blocks } = resolveInput(input);
  const scenes = deriveScenes(blocks);
  const blockScenes = sceneNumbersByBlock(blocks);
  const aliasesToCanonical = new Map<string, string>();
  const aliasesByCanonical = new Map<string, Set<string>>();
  for (const imported of document?.characters ?? []) {
    const canonical = normalizeCharacterName(imported.canonicalName || imported.displayName);
    if (!canonical) continue;
    const aliases = [imported.canonicalName, imported.displayName, ...imported.aliases].map(normalizeCharacterName).filter(Boolean);
    aliasesByCanonical.set(canonical, new Set(aliases.filter((alias) => alias !== canonical)));
    for (const alias of aliases) aliasesToCanonical.set(alias, canonical);
  }

  interface Accumulator {
    name: string;
    aliases: Set<string>;
    cueVariants: Set<string>;
    firstCueIndex: number;
    appearances: Map<number, CharacterSceneAppearance>;
    dialogueLines: DialogueLine[];
  }
  const profiles = new Map<string, Accumulator>();
  const sceneCharacters = new Map<number, Set<string>>();
  let active: { profile: Accumulator; sceneNumber: number; sceneId: string } | undefined;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const sceneNumber = blockScenes[index] ?? 1;
    const sceneId = scenes[sceneNumber - 1]?.id ?? "scene-1";
    if (block.type === "character") {
      const normalizedCue = normalizeCharacterName(block.text);
      const name = aliasesToCanonical.get(normalizedCue) ?? normalizedCue;
      if (!name) {
        active = undefined;
        continue;
      }
      const profile = profiles.get(name) ?? {
        name,
        aliases: new Set(aliasesByCanonical.get(name) ?? []),
        cueVariants: new Set<string>(),
        firstCueIndex: index,
        appearances: new Map<number, CharacterSceneAppearance>(),
        dialogueLines: [],
      };
      if (normalizedCue !== name) profile.aliases.add(normalizedCue);
      profile.cueVariants.add(block.text.trim().toUpperCase());
      const appearance = profile.appearances.get(sceneNumber) ?? { sceneNumber, sceneId, cueCount: 0, dialogueCount: 0, dialogueWords: 0 };
      appearance.cueCount++;
      profile.appearances.set(sceneNumber, appearance);
      profiles.set(name, profile);
      const present = sceneCharacters.get(sceneNumber) ?? new Set<string>();
      present.add(name);
      sceneCharacters.set(sceneNumber, present);
      active = { profile, sceneNumber, sceneId };
    } else if (block.type === "dialogue" && active) {
      const appearance = active.profile.appearances.get(active.sceneNumber)!;
      appearance.dialogueCount++;
      appearance.dialogueWords += words(block.text);
      active.profile.dialogueLines.push({ sceneNumber: active.sceneNumber, sceneId: active.sceneId, blockId: block.id, text: block.text });
    } else if (block.type !== "parenthetical") {
      active = undefined;
    }
  }

  return [...profiles.values()].map((profile) => {
    const appearances = [...profile.appearances.values()].sort((a, b) => a.sceneNumber - b.sceneNumber);
    const sceneNumbers = appearances.map((appearance) => appearance.sceneNumber);
    const coAppearances = new Map<string, number[]>();
    for (const sceneNumber of sceneNumbers) {
      for (const character of sceneCharacters.get(sceneNumber) ?? []) {
        if (character === profile.name) continue;
        const shared = coAppearances.get(character) ?? [];
        shared.push(sceneNumber);
        coAppearances.set(character, shared);
      }
    }
    const aliases = unique(profile.aliases);
    const result: CharacterProfile = {
      id: canonicalId("character", profile.name),
      kind: "character",
      name: profile.name,
      aliases,
      cueVariants: unique(profile.cueVariants),
      status: "detected",
      firstScene: sceneNumbers[0],
      lastScene: sceneNumbers[sceneNumbers.length - 1],
      firstDescription: nearbyDescription(blocks, profile.firstCueIndex, [profile.name, ...aliases]),
      cueCount: appearances.reduce((total, appearance) => total + appearance.cueCount, 0),
      dialogueCount: profile.dialogueLines.length,
      dialogueWords: appearances.reduce((total, appearance) => total + appearance.dialogueWords, 0),
      sceneCount: sceneNumbers.length,
      sceneNumbers,
      appearances,
      coAppearances: [...coAppearances].map(([character, sharedScenes]) => ({ character, count: sharedScenes.length, sceneNumbers: sharedScenes }))
        .sort((a, b) => b.count - a.count || a.character.localeCompare(b.character)),
      absenceGaps: absenceGaps(sceneNumbers),
      dialogueLines: profile.dialogueLines,
    };
    return result;
  }).sort((a, b) => b.cueCount - a.cueCount || a.name.localeCompare(b.name));
}

export function analyzeLocations(input: AnalysisInput): LocationProfile[] {
  const { document, blocks } = resolveInput(input);
  const aliasesToCanonical = new Map<string, string>();
  const aliasesByCanonical = new Map<string, Set<string>>();
  for (const imported of document?.locations ?? []) {
    const canonical = imported.canonicalName.trim().toUpperCase();
    const aliases = [imported.canonicalName, imported.displayName].map((name) => name.trim().toUpperCase()).filter(Boolean);
    aliasesByCanonical.set(canonical, new Set(aliases.filter((alias) => alias !== canonical)));
    for (const alias of aliases) aliasesToCanonical.set(alias, canonical);
  }
  const profiles = new Map<string, { aliases: Set<string>; appearances: LocationAppearance[] }>();
  for (const scene of deriveScenes(blocks)) {
    const parsed = parseHeading(scene.heading);
    const parsedLocation = parsed.location.trim().toUpperCase();
    if (!parsedLocation) continue;
    const name = aliasesToCanonical.get(parsedLocation) ?? parsedLocation;
    const profile = profiles.get(name) ?? { aliases: new Set(aliasesByCanonical.get(name) ?? []), appearances: [] };
    if (parsedLocation !== name) profile.aliases.add(parsedLocation);
    profile.appearances.push({
      sceneNumber: scene.number,
      sceneId: scene.id,
      heading: scene.heading,
      interiorExterior: parsed.intExt,
      timeOfDay: parsed.timeOfDay,
    });
    profiles.set(name, profile);
  }
  return [...profiles].map(([name, profile]) => {
    const sceneNumbers = profile.appearances.map((appearance) => appearance.sceneNumber);
    return {
      id: canonicalId("location", name),
      kind: "location" as const,
      name,
      aliases: unique(profile.aliases),
      status: "detected" as const,
      firstScene: sceneNumbers[0],
      lastScene: sceneNumbers[sceneNumbers.length - 1],
      sceneCount: sceneNumbers.length,
      sceneNumbers,
      interiorExterior: unique(profile.appearances.map((appearance) => appearance.interiorExterior)),
      timesOfDay: unique(profile.appearances.map((appearance) => appearance.timeOfDay)),
      appearances: profile.appearances,
    };
  }).sort((a, b) => a.firstScene - b.firstScene || a.name.localeCompare(b.name));
}

function termPattern(term: string): string {
  const value = escaped(term.toLowerCase());
  if (value.endsWith("fe")) return `${value.slice(0, -2)}(?:fe|ves)`;
  if (/[^aeiou]y$/.test(value)) return `${value.slice(0, -1)}(?:y|ies)`;
  if (/(?:s|x|z|ch|sh)$/.test(value)) return `${value}(?:es)?`;
  return `${value}s?`;
}

function termMatches(text: string, term: string): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(`(?:^|[^a-z0-9])(${termPattern(term)})(?=$|[^a-z0-9])`, "gi"))];
}

function characterMentioned(text: string, character: CharacterProfile): boolean {
  return [character.name, ...character.aliases].some((name) => new RegExp(`(?:^|[^A-Z0-9])${escaped(name)}(?:$|[^A-Z0-9])`, "i").test(text));
}

const OWNERSHIP_VERBS = "has|holds|grabs|carries|wears|uses|takes|owns|drives|draws|opens|reads|picks up|pulls";

function ownershipLanguage(text: string, character: string, object: string): boolean {
  const name = escaped(character);
  const item = termPattern(object);
  return new RegExp(`${name}.{0,40}(?:${OWNERSHIP_VERBS}).{0,40}${item}`, "i").test(text)
    || new RegExp(`${name}(?:'s|’s).{0,30}${item}`, "i").test(text);
}

function productionCategory(category: string): string {
  return ({ weapon: "weapons", vehicle: "vehicles", animal: "animals", wardrobe: "wardrobe" } as Record<string, string>)[category] ?? "props";
}

function associationsFromContinuity(continuity: ObjectContinuityEntry[]): ObjectAssociation[] {
  const found = new Map<string, { scenes: Set<number>; mentions: number; ownershipSignals: number; sameAction: boolean }>();
  for (const occurrence of continuity) {
    for (const character of occurrence.associatedCharacters) {
      const association = found.get(character) ?? { scenes: new Set<number>(), mentions: 0, ownershipSignals: 0, sameAction: false };
      association.scenes.add(occurrence.sceneNumber);
      association.mentions += occurrence.mentionCount;
      association.sameAction ||= occurrence.ownershipCharacters.includes(character) || occurrence.associatedCharacters.length > 1;
      if (occurrence.ownershipCharacters.includes(character)) association.ownershipSignals += occurrence.mentionCount;
      found.set(character, association);
    }
  }
  return [...found].map(([character, association]) => ({
    character,
    scenes: [...association.scenes].sort((a, b) => a - b),
    mentions: association.mentions,
    ownershipSignals: association.ownershipSignals,
    reason: association.ownershipSignals ? "ownership language" as const : association.sameAction ? "same action" as const : "only character in scene" as const,
  })).sort((a, b) => b.ownershipSignals - a.ownershipSignals || b.mentions - a.mentions || a.character.localeCompare(b.character));
}

export function analyzeObjects(input: AnalysisInput, characterProfiles = analyzeCharacters(input)): ObjectProfile[] {
  const { blocks } = resolveInput(input);
  const scenes = deriveScenes(blocks);
  const blockScenes = sceneNumbersByBlock(blocks);
  const charactersByScene = new Map<number, string[]>();
  for (const character of characterProfiles) {
    for (const scene of character.sceneNumbers) {
      const present = charactersByScene.get(scene) ?? [];
      present.push(character.name);
      charactersByScene.set(scene, present);
    }
  }
  return detectObjects(blocks).map((object) => {
    const continuity: ObjectContinuityEntry[] = [];
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      if (block.type !== "action") continue;
      const matches = termMatches(block.text, object.name);
      if (!matches.length) continue;
      const sceneNumber = blockScenes[index] ?? 1;
      const namedCharacters = characterProfiles.filter((character) => characterMentioned(block.text, character)).map((character) => character.name);
      const associatedCharacters = namedCharacters.length === 0 && (charactersByScene.get(sceneNumber)?.length ?? 0) === 1
        ? [...charactersByScene.get(sceneNumber)!]
        : namedCharacters;
      const ownershipCharacters = associatedCharacters.filter((character) => ownershipLanguage(block.text, character, object.name));
      continuity.push({
        sceneNumber,
        sceneId: scenes[sceneNumber - 1]?.id ?? "scene-1",
        blockId: block.id,
        mentionCount: matches.length,
        excerpt: block.text.trim(),
        associatedCharacters: unique(associatedCharacters),
        ownershipCharacters: unique(ownershipCharacters),
      });
    }
    const associations = associationsFromContinuity(continuity);
    const sceneNumbers = unique(continuity.map((entry) => String(entry.sceneNumber))).map(Number).sort((a, b) => a - b);
    return {
      id: object.id || canonicalId("object", object.name),
      kind: "object" as const,
      name: object.name,
      aliases: [],
      status: object.status,
      category: object.category,
      productionCategory: productionCategory(object.category),
      confidence: object.confidence,
      mentions: continuity.reduce((total, entry) => total + entry.mentionCount, 0),
      firstScene: sceneNumbers[0],
      lastScene: sceneNumbers[sceneNumbers.length - 1],
      sceneNumbers,
      firstMention: continuity[0],
      lastMention: continuity[continuity.length - 1],
      likelyOwner: associations[0] && (associations[0].ownershipSignals > 0 || associations.length === 1) ? associations[0].character : undefined,
      associations,
      continuity,
    };
  });
}

function refreshCharacter(profile: CharacterProfile): CharacterProfile {
  const appearanceMap = new Map<number, CharacterSceneAppearance>();
  for (const appearance of profile.appearances) {
    const current = appearanceMap.get(appearance.sceneNumber) ?? { ...appearance, cueCount: 0, dialogueCount: 0, dialogueWords: 0 };
    current.cueCount += appearance.cueCount;
    current.dialogueCount += appearance.dialogueCount;
    current.dialogueWords += appearance.dialogueWords;
    appearanceMap.set(appearance.sceneNumber, current);
  }
  profile.appearances = [...appearanceMap.values()].sort((a, b) => a.sceneNumber - b.sceneNumber);
  profile.sceneNumbers = profile.appearances.map((appearance) => appearance.sceneNumber);
  profile.firstScene = profile.sceneNumbers[0] ?? 0;
  profile.lastScene = profile.sceneNumbers[profile.sceneNumbers.length - 1] ?? 0;
  profile.sceneCount = profile.sceneNumbers.length;
  profile.cueCount = profile.appearances.reduce((total, appearance) => total + appearance.cueCount, 0);
  profile.dialogueCount = profile.dialogueLines.length;
  profile.dialogueWords = profile.appearances.reduce((total, appearance) => total + appearance.dialogueWords, 0);
  profile.absenceGaps = absenceGaps(profile.sceneNumbers);
  const shared = new Map<string, Set<number>>();
  for (const coAppearance of profile.coAppearances) {
    if (coAppearance.character === profile.name) continue;
    const scenes = shared.get(coAppearance.character) ?? new Set<number>();
    coAppearance.sceneNumbers.filter((scene) => profile.sceneNumbers.includes(scene)).forEach((scene) => scenes.add(scene));
    if (scenes.size) shared.set(coAppearance.character, scenes);
  }
  profile.coAppearances = [...shared].map(([character, scenes]) => ({ character, count: scenes.size, sceneNumbers: [...scenes].sort((a, b) => a - b) }));
  return profile;
}

function refreshLocation(profile: LocationProfile): LocationProfile {
  profile.appearances = [...new Map(profile.appearances.map((appearance) => [appearance.sceneId, appearance])).values()].sort((a, b) => a.sceneNumber - b.sceneNumber);
  profile.sceneNumbers = profile.appearances.map((appearance) => appearance.sceneNumber);
  profile.firstScene = profile.sceneNumbers[0] ?? 0;
  profile.lastScene = profile.sceneNumbers[profile.sceneNumbers.length - 1] ?? 0;
  profile.sceneCount = profile.sceneNumbers.length;
  profile.interiorExterior = unique(profile.appearances.map((appearance) => appearance.interiorExterior));
  profile.timesOfDay = unique(profile.appearances.map((appearance) => appearance.timeOfDay));
  return profile;
}

function refreshObject(profile: ObjectProfile): ObjectProfile {
  const entries = new Map<string, ObjectContinuityEntry>();
  for (const occurrence of profile.continuity) {
    const current = entries.get(occurrence.blockId);
    if (current) {
      current.mentionCount += occurrence.mentionCount;
      current.associatedCharacters = unique([...current.associatedCharacters, ...occurrence.associatedCharacters]);
      current.ownershipCharacters = unique([...current.ownershipCharacters, ...occurrence.ownershipCharacters]);
    } else entries.set(occurrence.blockId, { ...occurrence, associatedCharacters: [...occurrence.associatedCharacters], ownershipCharacters: [...occurrence.ownershipCharacters] });
  }
  profile.continuity = [...entries.values()].sort((a, b) => a.sceneNumber - b.sceneNumber);
  profile.sceneNumbers = [...new Set(profile.continuity.map((entry) => entry.sceneNumber))];
  profile.firstScene = profile.sceneNumbers[0] ?? 0;
  profile.lastScene = profile.sceneNumbers[profile.sceneNumbers.length - 1] ?? 0;
  profile.mentions = profile.continuity.reduce((total, entry) => total + entry.mentionCount, 0);
  profile.firstMention = profile.continuity[0];
  profile.lastMention = profile.continuity[profile.continuity.length - 1];
  profile.associations = associationsFromContinuity(profile.continuity);
  profile.likelyOwner = profile.associations[0] && (profile.associations[0].ownershipSignals > 0 || profile.associations.length === 1) ? profile.associations[0].character : undefined;
  return profile;
}

function cloneEntities(entities: AnalysisEntities): AnalysisEntities {
  return {
    characters: entities.characters.map((profile) => refreshCharacter({
      ...profile,
      aliases: [...profile.aliases],
      cueVariants: [...profile.cueVariants],
      sceneNumbers: [...profile.sceneNumbers],
      appearances: profile.appearances.map((appearance) => ({ ...appearance })),
      coAppearances: profile.coAppearances.map((appearance) => ({ ...appearance, sceneNumbers: [...appearance.sceneNumbers] })),
      absenceGaps: profile.absenceGaps.map((gap) => ({ ...gap })),
      dialogueLines: profile.dialogueLines.map((line) => ({ ...line })),
    })),
    locations: entities.locations.map((profile) => refreshLocation({
      ...profile,
      aliases: [...profile.aliases],
      sceneNumbers: [...profile.sceneNumbers],
      interiorExterior: [...profile.interiorExterior],
      timesOfDay: [...profile.timesOfDay],
      appearances: profile.appearances.map((appearance) => ({ ...appearance })),
    })),
    objects: entities.objects.map((profile) => refreshObject({
      ...profile,
      aliases: [...profile.aliases],
      sceneNumbers: [...profile.sceneNumbers],
      associations: profile.associations.map((association) => ({ ...association, scenes: [...association.scenes] })),
      continuity: profile.continuity.map((entry) => ({ ...entry, associatedCharacters: [...entry.associatedCharacters], ownershipCharacters: [...entry.ownershipCharacters] })),
    })),
  };
}

function entityById(entities: AnalysisEntities, kind: AnalysisEntityKind, id: string): AnalysisEntityBase | undefined {
  if (kind === "character") return entities.characters.find((entity) => entity.id === id);
  if (kind === "location") return entities.locations.find((entity) => entity.id === id);
  return entities.objects.find((entity) => entity.id === id);
}

function replaceCharacterReferences(entities: AnalysisEntities, from: string, to: string) {
  for (const character of entities.characters) {
    character.coAppearances.forEach((appearance) => { if (appearance.character === from) appearance.character = to; });
    refreshCharacter(character);
  }
  for (const object of entities.objects) {
    object.continuity.forEach((entry) => {
      entry.associatedCharacters = unique(entry.associatedCharacters.map((character) => character === from ? to : character));
      entry.ownershipCharacters = unique(entry.ownershipCharacters.map((character) => character === from ? to : character));
    });
    refreshObject(object);
  }
}

function mergeCharacters(target: CharacterProfile, source: CharacterProfile) {
  const firstDescription = target.firstScene <= source.firstScene ? target.firstDescription ?? source.firstDescription : source.firstDescription ?? target.firstDescription;
  target.aliases = unique([...target.aliases, source.name, ...source.aliases]);
  target.cueVariants = unique([...target.cueVariants, ...source.cueVariants]);
  target.appearances.push(...source.appearances.map((appearance) => ({ ...appearance })));
  target.coAppearances.push(...source.coAppearances.map((appearance) => ({ ...appearance, sceneNumbers: [...appearance.sceneNumbers] })));
  target.dialogueLines.push(...source.dialogueLines.map((line) => ({ ...line })));
  target.firstDescription = firstDescription;
  refreshCharacter(target);
}

function mergeLocations(target: LocationProfile, source: LocationProfile) {
  target.aliases = unique([...target.aliases, source.name, ...source.aliases]);
  target.appearances.push(...source.appearances.map((appearance) => ({ ...appearance })));
  refreshLocation(target);
}

function mergeObjects(target: ObjectProfile, source: ObjectProfile) {
  target.aliases = unique([...target.aliases, source.name, ...source.aliases]);
  target.continuity.push(...source.continuity.map((entry) => ({ ...entry, associatedCharacters: [...entry.associatedCharacters], ownershipCharacters: [...entry.ownershipCharacters] })));
  target.confidence = Math.max(target.confidence, source.confidence);
  refreshObject(target);
}

export function applyEntityOverrides(entities: AnalysisEntities, overrides: readonly EntityOverride[]): AnalysisEntities {
  const result = cloneEntities(entities);
  for (const override of overrides) {
    const entity = entityById(result, override.kind, override.entityId);
    if (!entity) continue;
    if (override.action === "confirm" || override.action === "reject") {
      entity.status = override.action === "confirm" ? "confirmed" : "rejected";
    } else if (override.action === "rename") {
      const name = override.name.trim().toUpperCase();
      if (!name || name === entity.name) continue;
      const previous = entity.name;
      entity.name = name;
      entity.aliases = unique([...entity.aliases, previous]);
      if (override.kind === "character") replaceCharacterReferences(result, previous, name);
    } else if (override.action === "merge") {
      if (override.entityId === override.targetId) continue;
      if (override.kind === "character") {
        const source = result.characters.find((item) => item.id === override.entityId);
        const target = result.characters.find((item) => item.id === override.targetId);
        if (!source || !target) continue;
        mergeCharacters(target, source);
        replaceCharacterReferences(result, source.name, target.name);
      } else if (override.kind === "location") {
        const source = result.locations.find((item) => item.id === override.entityId);
        const target = result.locations.find((item) => item.id === override.targetId);
        if (!source || !target) continue;
        mergeLocations(target, source);
      } else {
        const source = result.objects.find((item) => item.id === override.entityId);
        const target = result.objects.find((item) => item.id === override.targetId);
        if (!source || !target) continue;
        mergeObjects(target, source);
      }
      entity.status = "merged";
      entity.mergedInto = override.targetId;
    } else if (override.action === "split") {
      const selected = new Set(override.sceneNumbers);
      if (!selected.size || entityById(result, override.kind, override.newId)) continue;
      const name = override.name.trim().toUpperCase();
      if (!name) continue;
      if (override.kind === "character") {
        const source = result.characters.find((item) => item.id === override.entityId)!;
        if (!source.sceneNumbers.some((scene) => selected.has(scene)) || source.sceneNumbers.every((scene) => selected.has(scene))) continue;
        const movedFirstAppearance = selected.has(source.firstScene);
        const split = refreshCharacter({
          ...source,
          id: override.newId,
          name,
          aliases: unique([source.name, ...source.aliases]),
          status: "detected",
          mergedInto: undefined,
          firstDescription: movedFirstAppearance ? source.firstDescription : undefined,
          appearances: source.appearances.filter((appearance) => selected.has(appearance.sceneNumber)).map((appearance) => ({ ...appearance })),
          dialogueLines: source.dialogueLines.filter((line) => selected.has(line.sceneNumber)).map((line) => ({ ...line })),
          coAppearances: source.coAppearances.map((appearance) => ({ ...appearance, sceneNumbers: appearance.sceneNumbers.filter((scene) => selected.has(scene)) })),
          absenceGaps: [],
          sceneNumbers: [],
        });
        source.appearances = source.appearances.filter((appearance) => !selected.has(appearance.sceneNumber));
        source.dialogueLines = source.dialogueLines.filter((line) => !selected.has(line.sceneNumber));
        source.coAppearances = source.coAppearances.map((appearance) => ({ ...appearance, sceneNumbers: appearance.sceneNumbers.filter((scene) => !selected.has(scene)) }));
        if (movedFirstAppearance) source.firstDescription = undefined;
        refreshCharacter(source);
        result.characters.push(split);
      } else if (override.kind === "location") {
        const source = result.locations.find((item) => item.id === override.entityId)!;
        if (!source.sceneNumbers.some((scene) => selected.has(scene)) || source.sceneNumbers.every((scene) => selected.has(scene))) continue;
        const split = refreshLocation({ ...source, id: override.newId, name, aliases: unique([source.name, ...source.aliases]), status: "detected", mergedInto: undefined, appearances: source.appearances.filter((appearance) => selected.has(appearance.sceneNumber)), sceneNumbers: [] });
        source.appearances = source.appearances.filter((appearance) => !selected.has(appearance.sceneNumber));
        refreshLocation(source);
        result.locations.push(split);
      } else {
        const source = result.objects.find((item) => item.id === override.entityId)!;
        if (!source.sceneNumbers.some((scene) => selected.has(scene)) || source.sceneNumbers.every((scene) => selected.has(scene))) continue;
        const split = refreshObject({ ...source, id: override.newId, name, aliases: unique([source.name, ...source.aliases]), status: "detected", mergedInto: undefined, continuity: source.continuity.filter((entry) => selected.has(entry.sceneNumber)), sceneNumbers: [], associations: [] });
        source.continuity = source.continuity.filter((entry) => !selected.has(entry.sceneNumber));
        refreshObject(source);
        result.objects.push(split);
      }
    }
  }
  return result;
}

const PRODUCTION_TERMS: Partial<Record<ProductionCategory, string[]>> = {
  stunts: ["fight", "punch", "crash", "fall", "jump", "explosion", "chase", "stunt"],
  vfx: ["vfx", "cgi", "spaceship", "monster", "magical", "hologram", "green screen"],
  sfx: ["explosion", "gunshot", "thunder", "alarm", "screech", "blast"],
  wardrobe: ["coat", "dress", "uniform", "hat", "ring", "necklace", "costume"],
  makeup: ["blood", "scar", "bruise", "wound", "makeup", "prosthetic"],
  crowdScenes: ["crowd", "mob", "audience", "dozens", "hundreds", "extras"],
};

function emptyProduction(): ProductionReport {
  return {
    cast: [], locations: [], props: [], vehicles: [], animals: [], weapons: [], stunts: [], vfx: [], sfx: [], wardrobe: [], makeup: [], nightScenes: [], crowdScenes: [], highComplexityScenes: [],
  };
}

function evidence(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function buildProduction(blocks: ScreenplayBlock[], scenes: SceneAnalysisRow[], entities: AnalysisEntities) {
  const report = emptyProduction();
  const sceneByNumber = new Map(scenes.map((scene) => [scene.number, scene]));
  const add = (category: ProductionCategory, sceneNumber: number, item: string, detail: string, blockId?: string) => {
    const scene = sceneByNumber.get(sceneNumber);
    if (scene) report[category].push({ category, sceneNumber, sceneId: scene.id, heading: scene.heading, item: item.toUpperCase(), evidence: detail, blockId });
  };
  for (const character of entities.characters.filter((item) => item.status !== "rejected" && item.status !== "merged")) {
    character.appearances.forEach((appearance) => add("cast", appearance.sceneNumber, character.name, `${appearance.cueCount} cue(s), ${appearance.dialogueCount} dialogue block(s)`));
  }
  for (const location of entities.locations.filter((item) => item.status !== "rejected" && item.status !== "merged")) {
    location.appearances.forEach((appearance) => add("locations", appearance.sceneNumber, location.name, appearance.heading));
  }
  for (const object of entities.objects.filter((item) => item.status !== "rejected" && item.status !== "merged")) {
    for (const occurrence of object.continuity) {
      add("props", occurrence.sceneNumber, object.name, occurrence.excerpt, occurrence.blockId);
      if (["vehicles", "animals", "weapons", "wardrobe"].includes(object.productionCategory)) {
        add(object.productionCategory as ProductionCategory, occurrence.sceneNumber, object.name, occurrence.excerpt, occurrence.blockId);
      }
    }
  }
  scenes.forEach((scene) => {
    if (scene.timeOfDay === "NIGHT") add("nightScenes", scene.number, "NIGHT", scene.heading);
    const sceneBlocks = blocks.slice(scene.blockStart, scene.blockEnd + 1).filter((block) => block.type === "action");
    for (const block of sceneBlocks) {
      for (const [category, terms] of Object.entries(PRODUCTION_TERMS) as [ProductionCategory, string[]][]) {
        for (const term of terms) if (termMatches(block.text, term).length) add(category, scene.number, term, evidence(block.text), block.id);
      }
    }
  });
  for (const category of Object.keys(report) as ProductionCategory[]) {
    report[category] = [...new Map(report[category].map((row) => [`${row.sceneId}\0${row.blockId ?? ""}\0${row.item}`, row])).values()]
      .sort((a, b) => a.sceneNumber - b.sceneNumber || a.item.localeCompare(b.item));
  }
  const complexity = new Map<number, number>();
  for (const scene of scenes) {
    const flags = (Object.keys(report) as ProductionCategory[]).filter((category) => !["cast", "locations", "props", "highComplexityScenes"].includes(category) && report[category].some((row) => row.sceneNumber === scene.number));
    const score = Math.min(10, 1 + flags.length);
    complexity.set(scene.number, score);
    if (score >= 4) add("highComplexityScenes", scene.number, `Complexity ${score}`, flags.join(", "));
  }
  return { report, complexity };
}

function coverage(hooks: readonly CoverageHook[] | undefined, scenes: SceneAnalysisRow[], beats: BeatSummary[], blocks: ScreenplayBlock[]): CoverageResult[] {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const beatIds = new Set(beats.map((beat) => beat.id));
  const textByScene = new Map(scenes.map((scene) => [scene.id, blocks.slice(scene.blockStart, scene.blockEnd + 1).map((block) => block.text).join("\n").toLowerCase()]));
  return (hooks ?? []).map((hook) => {
    const requestedScenes = [...hook.sceneIds ?? []];
    const requestedBeats = [...hook.beatIds ?? []];
    const matchedSceneIds = new Set(requestedScenes.filter((id) => sceneIds.has(id)));
    const matchedBeatIds = new Set(requestedBeats.filter((id) => beatIds.has(id)));
    for (const keyword of hook.keywords ?? []) {
      const needle = keyword.trim().toLowerCase();
      if (!needle) continue;
      for (const [sceneId, text] of textByScene) if (text.includes(needle)) matchedSceneIds.add(sceneId);
      for (const beat of beats) if (beat.text.toLowerCase().includes(needle)) matchedBeatIds.add(beat.id);
    }
    const missingSceneIds = requestedScenes.filter((id) => !sceneIds.has(id));
    const missingBeatIds = requestedBeats.filter((id) => !beatIds.has(id));
    const matches = matchedSceneIds.size + matchedBeatIds.size;
    return {
      id: hook.id,
      label: hook.label,
      matchedSceneIds: [...matchedSceneIds],
      matchedBeatIds: [...matchedBeatIds],
      missingSceneIds,
      missingBeatIds,
      status: matches === 0 ? "uncovered" as const : missingSceneIds.length || missingBeatIds.length ? "partial" as const : "covered" as const,
      resolved: hook.resolved,
    };
  });
}

function warningsFor(scenes: SceneAnalysisRow[]): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];
  for (const scene of scenes) {
    if (scene.wordCount >= 20 && scene.dialogueDensity >= 0.65) warnings.push({ code: "dialogue-heavy", severity: "info", sceneNumber: scene.number, message: `Scene ${scene.number} is ${Math.round(scene.dialogueDensity * 100)}% dialogue.` });
    if (scene.wordCount >= 100 && scene.dialogueDensity <= 0.05) warnings.push({ code: "action-heavy", severity: "info", sceneNumber: scene.number, message: `Scene ${scene.number} has little or no dialogue.` });
    if (scene.estimatedPages >= 3) warnings.push({ code: "long-scene", severity: "warning", sceneNumber: scene.number, message: `Scene ${scene.number} is estimated at ${scene.estimatedPages} pages.` });
  }
  for (let index = 0; index <= scenes.length - 3; index++) {
    const run = scenes.slice(index, index + 3);
    if (run.every((scene) => scene.estimatedPages <= 0.25)) {
      warnings.push({ code: "short-scene-run", severity: "info", sceneNumber: run[0].number, message: `Scenes ${run[0].number}-${run[2].number} form a rapid run of very short scenes.` });
      index += 2;
    }
  }
  const lengths = scenes.map((scene) => scene.estimatedPages).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
  const longest = scenes.reduce<SceneAnalysisRow | undefined>((found, scene) => !found || scene.estimatedPages > found.estimatedPages ? scene : found, undefined);
  if (longest && longest.estimatedPages >= 2 && longest.estimatedPages > median * 3) warnings.push({ code: "uneven-scene-length", severity: "warning", sceneNumber: longest.number, message: `Scene ${longest.number} is more than three times the median scene length.` });
  return warnings;
}

function revisionSummary(input: RevisionSummaryInput | undefined): RevisionSummary | undefined {
  if (!input) return undefined;
  const counts: RevisionSummary["counts"] = { added: 0, removed: 0, moved: 0, edited: 0 };
  input.changes.forEach((change) => counts[change.kind]++);
  return { fromLabel: input.fromLabel, toLabel: input.toLabel, total: input.changes.length, counts, changes: input.changes.map((change) => ({ ...change })) };
}

export function compileAnalysis(document: ScreenplayDocument, options: CompileAnalysisOptions = {}): ScriptAnalysis {
  const blocks = document.blocks;
  const characters = analyzeCharacters(document);
  const baseEntities: AnalysisEntities = { characters, locations: analyzeLocations(document), objects: analyzeObjects(document, characters) };
  const entities = applyEntityOverrides(baseEntities, options.entityOverrides ?? []);
  const activeCharacters = entities.characters.filter((entity) => entity.status !== "rejected" && entity.status !== "merged");
  const activeLocations = entities.locations.filter((entity) => entity.status !== "rejected" && entity.status !== "merged");
  const activeObjects = entities.objects.filter((entity) => entity.status !== "rejected" && entity.status !== "merged");
  const derivedScenes = deriveScenes(blocks);
  let scenes: SceneAnalysisRow[] = derivedScenes.map((scene, index) => {
    const blockEnd = (derivedScenes[index + 1]?.blockIndex ?? blocks.length) - 1;
    const sceneBlocks = blocks.slice(scene.blockIndex, blockEnd + 1);
    const wordCount = blockWords(sceneBlocks);
    const dialogueWords = blockWords(sceneBlocks.filter((block) => block.type === "dialogue"));
    const contentWords = blockWords(sceneBlocks.filter((block) => block.type === "action" || block.type === "dialogue"));
    const estimatedEighths = Math.max(1, Math.ceil((wordCount / 250) * 8));
    const heading = parseHeading(scene.heading);
    return {
      id: scene.id,
      number: scene.number,
      sceneNumber: blocks[scene.blockIndex]?.metadata?.Number,
      heading: scene.heading,
      interiorExterior: heading.intExt,
      location: heading.location,
      timeOfDay: heading.timeOfDay,
      blockStart: scene.blockIndex,
      blockEnd,
      blockCount: sceneBlocks.length,
      wordCount,
      dialogueWords,
      dialogueDensity: rounded(contentWords ? dialogueWords / contentWords : 0),
      estimatedEighths,
      estimatedPages: estimatedEighths / 8,
      characters: activeCharacters.filter((character) => character.sceneNumbers.includes(scene.number)).map((character) => character.name),
      objects: activeObjects.filter((object) => object.sceneNumbers.includes(scene.number)).map((object) => object.name),
      complexityScore: 1,
    };
  });
  const productionResult = buildProduction(blocks, scenes, entities);
  scenes = scenes.map((scene) => ({ ...scene, complexityScore: productionResult.complexity.get(scene.number) ?? 1 }));

  const built = options.storyStructure ? {
    acts: options.storyStructure.acts.map((act) => ({
      id: act.id,
      title: act.title,
      sequences: options.storyStructure!.sequences.filter((sequence) => sequence.actId === act.id).map((sequence) => ({ id: sequence.id, title: sequence.title, sceneIds: sequence.sceneIds })),
    })),
    beats: options.storyStructure.beats.flatMap((beat) => {
      const sceneId = beat.sceneId ?? options.storyStructure!.sequences.find((sequence) => sequence.id === beat.sequenceId)?.sceneIds[0];
      return sceneId ? [{ id: beat.id, text: beat.text, sceneId, status: beat.status }] : [];
    }),
  } : buildStructure(blocks);
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const sequences = built.acts.flatMap((act) => act.sequences.map((sequence) => {
    const rows = sequence.sceneIds.flatMap((id) => sceneById.get(id) ?? []);
    return {
      id: sequence.id,
      actId: act.id,
      title: sequence.title,
      sceneIds: sequence.sceneIds,
      sceneCount: rows.length,
      estimatedPages: rounded(rows.reduce((total, row) => total + row.estimatedPages, 0)),
      summary: `${sequence.title}: ${rows.length} scene${rows.length === 1 ? "" : "s"}${rows.length ? `, ${rows[0].heading} to ${rows[rows.length - 1].heading}` : ""}.`,
    };
  }));
  const acts = built.acts.map((act) => {
    const ids = act.sequences.flatMap((sequence) => sequence.sceneIds);
    const rows = ids.flatMap((id) => sceneById.get(id) ?? []);
    return {
      id: act.id,
      title: act.title,
      sceneIds: ids,
      sceneCount: rows.length,
      estimatedPages: rounded(rows.reduce((total, row) => total + row.estimatedPages, 0)),
      summary: `${act.title}: ${rows.length} scene${rows.length === 1 ? "" : "s"}${rows.length ? `, ${rows[0].heading} to ${rows[rows.length - 1].heading}` : ""}.`,
    };
  });
  const resolvedBeats = new Set(options.resolvedBeatIds ?? []);
  const beats: BeatSummary[] = built.beats.map((beat) => ({
    id: beat.id,
    text: beat.text,
    sceneId: beat.sceneId,
    sceneNumber: sceneById.get(beat.sceneId)?.number,
    status: resolvedBeats.has(beat.id) || beat.status === "complete" ? "resolved" : "unresolved",
  }));
  const structure = { acts, sequences, beats };
  const characterArcs = activeCharacters.map((character) => {
    const actPresence = acts.filter((act) => character.appearances.some((appearance) => act.sceneIds.includes(derivedScenes[appearance.sceneNumber - 1]?.id))).map((act) => act.title);
    const midpoint = (character.firstScene + character.lastScene) / 2;
    const early = character.appearances.filter((appearance) => appearance.sceneNumber <= midpoint).reduce((total, appearance) => total + appearance.dialogueCount, 0);
    const late = character.appearances.filter((appearance) => appearance.sceneNumber > midpoint).reduce((total, appearance) => total + appearance.dialogueCount, 0);
    const dialogueTrend = late > early + 1 ? "rising" as const : early > late + 1 ? "falling" as const : "steady" as const;
    return {
      character: character.name,
      firstScene: character.firstScene,
      lastScene: character.lastScene,
      actPresence,
      dialogueTrend,
      firstDescription: character.firstDescription,
      summary: `${character.name} appears from scene ${character.firstScene} through ${character.lastScene}, across ${actPresence.join(", ") || "no assigned act"}; dialogue is ${dialogueTrend}.`,
    };
  });
  const wordCount = blockWords(blocks);
  const dialogueWords = blockWords(blocks.filter((block) => block.type === "dialogue"));
  const contentWords = blockWords(blocks.filter((block) => block.type === "action" || block.type === "dialogue"));
  const pageEstimate = estimatePages(blocks);
  const title = options.episodeTitle ?? document.title ?? (document.titlePage.title || "Untitled Script");
  const episode = {
    title,
    sceneCount: scenes.length,
    pageEstimate,
    runtimeMinutes: pageEstimate,
    actCount: acts.length,
    sequenceCount: sequences.length,
    beatCount: beats.length,
    characterCount: activeCharacters.length,
    locationCount: activeLocations.length,
    firstScene: scenes[0]?.heading,
    lastScene: scenes[scenes.length - 1]?.heading,
    summary: `${title}: ${scenes.length} scenes, ${pageEstimate} estimated pages, ${activeCharacters.length} characters, and ${activeLocations.length} locations.`,
  };
  return {
    title,
    scenes,
    pageEstimate,
    wordCount,
    dialogueWords,
    dialogueDensity: rounded(contentWords ? dialogueWords / contentWords : 0),
    entities,
    structure,
    episode,
    characterArcs,
    plotThreads: coverage(options.plotThreads, scenes, beats, blocks),
    treatmentCoverage: coverage(options.treatmentSections, scenes, beats, blocks),
    unresolvedBeats: beats.filter((beat) => beat.status === "unresolved"),
    pacingWarnings: warningsFor(scenes),
    revision: revisionSummary(options.revision),
    production: productionResult.report,
  };
}

const csvCell = (value: string | number | undefined) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export type AnalysisCsvSection = "scenes" | "characters" | "objects" | "production";

export function analysisToCsv(analysis: ScriptAnalysis, section: AnalysisCsvSection = "scenes"): string {
  let rows: (string | number | undefined)[][];
  if (section === "characters") rows = [
    ["character", "first_scene", "last_scene", "scenes", "cues", "dialogue_blocks", "dialogue_words"],
    ...analysis.entities.characters.map((character) => [character.name, character.firstScene, character.lastScene, character.sceneCount, character.cueCount, character.dialogueCount, character.dialogueWords]),
  ];
  else if (section === "objects") rows = [
    ["object", "category", "first_scene", "last_scene", "scenes", "mentions", "likely_owner"],
    ...analysis.entities.objects.map((object) => [object.name, object.category, object.firstScene, object.lastScene, object.sceneNumbers.join(" "), object.mentions, object.likelyOwner]),
  ];
  else if (section === "production") rows = [
    ["category", "scene", "heading", "item", "evidence"],
    ...Object.values(analysis.production).flat().map((row) => [row.category, row.sceneNumber, row.heading, row.item, row.evidence]),
  ];
  else rows = [
    ["scene", "heading", "location", "time", "words", "dialogue_density", "estimated_pages", "complexity"],
    ...analysis.scenes.map((scene) => [scene.number, scene.heading, scene.location, scene.timeOfDay, scene.wordCount, scene.dialogueDensity, scene.estimatedPages, scene.complexityScore]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function analysisToMarkdown(analysis: ScriptAnalysis): string {
  const sceneRows = analysis.scenes.map((scene) => `| ${scene.number} | ${scene.heading.replace(/\|/g, "\\|")} | ${scene.estimatedPages} | ${scene.dialogueDensity} | ${scene.complexityScore} |`).join("\n");
  const production = (Object.entries(analysis.production) as [ProductionCategory, ProductionRow[]][]).map(([category, rows]) => `- ${category}: ${rows.length}`).join("\n");
  return `# ${analysis.title} — Analysis\n\n- Scenes: ${analysis.scenes.length}\n- Estimated pages: ${analysis.pageEstimate}\n- Words: ${analysis.wordCount}\n- Dialogue density: ${analysis.dialogueDensity}\n- Unresolved beats: ${analysis.unresolvedBeats.length}\n\n## Scenes\n\n| # | Heading | Pages | Dialogue | Complexity |\n|---:|---|---:|---:|---:|\n${sceneRows || "| - | No scenes | - | - | - |"}\n\n## Production\n\n${production}\n`;
}

export const analysisToJson = (analysis: ScriptAnalysis, space = 2) => JSON.stringify(analysis, null, space);
