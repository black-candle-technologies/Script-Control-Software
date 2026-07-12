import {
  deriveCharacters,
  deriveLocations,
  deriveScenes,
  estimatePages,
  normalizeCharacterName,
  parseHeading,
  type Scene,
  type ScreenplayBlock,
  type ScreenplayDocument,
} from "./screenplay.ts";

export interface DetectedObject {
  id: string;
  name: string;
  category: string;
  sceneNumbers: number[];
  mentions: number;
  confidence: number;
  status: "detected" | "confirmed" | "rejected";
}

export interface StoryBeat {
  id: string;
  text: string;
  sceneId: string;
  status: "idea" | "drafted" | "complete";
}

export interface StorySequence {
  id: string;
  title: string;
  sceneIds: string[];
}

export interface StoryAct {
  id: string;
  title: string;
  sequences: StorySequence[];
}

export interface StoryStructure {
  acts: StoryAct[];
  beats: StoryBeat[];
}

export interface Breakdown {
  scenes: number;
  pages: number;
  words: number;
  dialogueWords: number;
  characters: number;
  locations: number;
  objects: DetectedObject[];
  categories: Record<string, number>;
  nightScenes: number;
  interiorScenes: number;
  exteriorScenes: number;
  complexity: { scene: number; score: number; reasons: string[] }[];
}

export interface DraftSnapshot {
  id: string;
  label: string;
  note: string;
  createdAt: string;
  milestone: boolean;
  document: ScreenplayDocument;
}

export interface DraftChange {
  kind: "added" | "removed" | "moved" | "edited";
  scene: string;
  summary: string;
}

const OBJECT_TERMS: Record<string, string[]> = {
  weapon: ["gun", "pistol", "rifle", "knife", "sword", "weapon"],
  vehicle: ["car", "truck", "bus", "van", "motorcycle", "bicycle", "boat", "plane"],
  document: ["letter", "book", "document", "file", "passport", "photograph", "photo", "map"],
  device: ["phone", "computer", "laptop", "tablet", "radio", "camera", "drive", "tape"],
  animal: ["dog", "cat", "horse", "bird", "animal"],
  wardrobe: ["coat", "dress", "uniform", "hat", "ring", "necklace", "watch"],
};

const PRODUCTION_TERMS: Record<string, string[]> = {
  vehicles: OBJECT_TERMS.vehicle,
  animals: OBJECT_TERMS.animal,
  weapons: OBJECT_TERMS.weapon,
  stunts: ["fight", "punch", "crash", "falls", "jumps", "explosion", "chase"],
  vfx: ["vfx", "cgi", "spaceship", "monster", "magical", "hologram"],
  sfx: ["explosion", "gunshot", "thunder", "alarm", "screech", "blast"],
  wardrobe: OBJECT_TERMS.wardrobe,
  makeup: ["blood", "scar", "bruise", "wound", "makeup"],
  crowds: ["crowd", "mob", "audience", "dozens", "hundreds"],
};

const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[character]!);

export function detectObjects(blocks: ScreenplayBlock[]): DetectedObject[] {
  const found = new Map<string, DetectedObject>();
  let scene = 0;
  for (const block of blocks) {
    if (block.type === "scene_heading") scene++;
    if (block.type !== "action") continue;
    const words = block.text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
    for (const [category, terms] of Object.entries(OBJECT_TERMS)) {
      for (const term of terms) {
        const mentions = words.filter((word) => word === term || word === `${term}s`).length;
        if (!mentions) continue;
        const current = found.get(term) ?? {
          id: `object-${term}`,
          name: term.toUpperCase(),
          category,
          sceneNumbers: [],
          mentions: 0,
          confidence: 0,
          status: "detected" as const,
        };
        current.mentions += mentions;
        if (scene && !current.sceneNumbers.includes(scene)) current.sceneNumbers.push(scene);
        current.confidence = Math.min(0.95, 0.55 + current.mentions * 0.1 + current.sceneNumbers.length * 0.05);
        found.set(term, current);
      }
    }
  }
  return [...found.values()].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}

export function buildStructure(blocks: ScreenplayBlock[]): StoryStructure {
  const scenes = deriveScenes(blocks);
  const acts: StoryAct[] = [];
  let act: StoryAct | undefined;
  let sequence: StorySequence | undefined;
  for (const scene of scenes) {
    const headingBlock = blocks[scene.blockIndex];
    const preceding = blocks.slice(0, scene.blockIndex).reverse();
    const actMarker = preceding.find((block) => block.type === "new_act");
    const actTitle = actMarker?.text.trim() || "Act I";
    if (!act || act.title !== actTitle) {
      act = { id: actMarker?.id ?? "act-1", title: actTitle, sequences: [] };
      acts.push(act);
      sequence = undefined;
    }
    if (!sequence || sequence.sceneIds.length >= 8) {
      sequence = { id: `${act.id}-sequence-${act.sequences.length + 1}`, title: `Sequence ${act.sequences.length + 1}`, sceneIds: [] };
      act.sequences.push(sequence);
    }
    sequence.sceneIds.push(scene.id);
    void headingBlock;
  }
  if (!acts.length) acts.push({ id: "act-1", title: "Act I", sequences: [] });
  const beats = blocks.flatMap((block, index) => {
    if (block.type !== "note" || !block.text.trim()) return [];
    const scene = [...scenes].reverse().find((item) => item.blockIndex < index);
    return scene ? [{ id: block.id, text: block.text.trim(), sceneId: scene.id, status: "drafted" as const }] : [];
  });
  return { acts, beats };
}

export function compileBreakdown(blocks: ScreenplayBlock[]): Breakdown {
  const scenes = deriveScenes(blocks);
  const text = blocks.filter((block) => block.type === "action").map((block) => block.text.toLowerCase()).join(" ");
  const countTerms = (terms: string[]) => terms.reduce((count, term) => count + (text.match(new RegExp(`\\b${term}(?:s|es)?\\b`, "g"))?.length ?? 0), 0);
  const categories = Object.fromEntries(Object.entries(PRODUCTION_TERMS).map(([name, terms]) => [name, countTerms(terms)]));
  const complexity = scenes.map((scene, index) => {
    const end = scenes[index + 1]?.blockIndex ?? blocks.length;
    const sceneText = blocks.slice(scene.blockIndex, end).map((block) => block.text.toLowerCase()).join(" ");
    const reasons = Object.entries(PRODUCTION_TERMS).filter(([, terms]) => terms.some((term) => new RegExp(`\\b${term}(?:s|es)?\\b`).test(sceneText))).map(([name]) => name);
    if (parseHeading(scene.heading).timeOfDay === "NIGHT") reasons.push("night");
    return { scene: scene.number, score: Math.min(5, 1 + reasons.length), reasons };
  });
  return {
    scenes: scenes.length,
    pages: estimatePages(blocks),
    words: wordCount(blocks),
    dialogueWords: wordCount(blocks.filter((block) => block.type === "dialogue")),
    characters: deriveCharacters(blocks).length,
    locations: deriveLocations(blocks).length,
    objects: detectObjects(blocks),
    categories,
    nightScenes: scenes.filter((scene) => parseHeading(scene.heading).timeOfDay === "NIGHT").length,
    interiorScenes: scenes.filter((scene) => parseHeading(scene.heading).intExt.startsWith("INT")).length,
    exteriorScenes: scenes.filter((scene) => parseHeading(scene.heading).intExt.startsWith("EXT")).length,
    complexity,
  };
}

export function compareDrafts(from: ScreenplayDocument, to: ScreenplayDocument): DraftChange[] {
  const before = sceneText(from);
  const after = sceneText(to);
  const changes: DraftChange[] = [];
  for (const [key, oldScene] of before) {
    const next = after.get(key);
    if (!next) changes.push({ kind: "removed", scene: oldScene.heading, summary: `${oldScene.heading} was removed.` });
    else if (oldScene.index !== next.index) changes.push({ kind: "moved", scene: oldScene.heading, summary: `${oldScene.heading} moved from scene ${oldScene.index + 1} to ${next.index + 1}.` });
    else if (oldScene.text !== next.text) changes.push({ kind: "edited", scene: oldScene.heading, summary: `${oldScene.heading} was edited.` });
  }
  for (const [key, next] of after) if (!before.has(key)) changes.push({ kind: "added", scene: next.heading, summary: `${next.heading} was added as scene ${next.index + 1}.` });
  return changes;
}

export function toFdx(doc: ScreenplayDocument): string {
  const types: Record<string, string> = {
    scene_heading: "Scene Heading", action: "Action", character: "Character", dialogue: "Dialogue",
    parenthetical: "Parenthetical", transition: "Transition", shot: "Shot", general: "General",
    lyrics: "Lyrics", cast_list: "Cast List", new_act: "New Act", end_of_act: "End of Act", note: "General",
  };
  const paragraphs = doc.blocks.filter((block) => block.text.trim()).map((block) =>
    `      <Paragraph Type="${types[block.type] ?? esc(block.originalType ?? "General")}"${block.metadata?.Number ? ` Number="${esc(block.metadata.Number)}"` : ""}><Text>${esc(block.text)}</Text></Paragraph>`,
  ).join("\n");
  const titlePage = doc.titlePage.title.trim() || doc.titlePage.author.trim() ? `  <TitlePage><Content>${doc.titlePage.title.trim() ? `<Paragraph Type="Title"><Text>${esc(doc.titlePage.title.trim())}</Text></Paragraph>` : ""}${doc.titlePage.author.trim() ? `<Paragraph Type="Author"><Text>${esc(doc.titlePage.author.trim())}</Text></Paragraph>` : ""}</Content></TitlePage>\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">\n${titlePage}  <Content>\n${paragraphs}\n  </Content>\n</FinalDraft>\n`;
}

export function breakdownMarkdown(title: string, breakdown: Breakdown): string {
  const categories = Object.entries(breakdown.categories).filter(([, count]) => count).map(([name, count]) => `- ${name}: ${count}`).join("\n") || "- None detected";
  return `# ${title} — Breakdown\n\n- Scenes: ${breakdown.scenes}\n- Estimated pages: ${breakdown.pages}\n- Words: ${breakdown.words}\n- Dialogue words: ${breakdown.dialogueWords}\n- Characters: ${breakdown.characters}\n- Locations: ${breakdown.locations}\n- Night scenes: ${breakdown.nightScenes}\n\n## Production categories\n\n${categories}\n`;
}

export function breakdownCsv(breakdown: Breakdown): string {
  return ["category,count", ...Object.entries(breakdown.categories).map(([name, count]) => `${name},${count}`)].join("\n") + "\n";
}

function wordCount(blocks: ScreenplayBlock[]) {
  return blocks.reduce((count, block) => count + (block.text.trim().match(/\S+/g)?.length ?? 0), 0);
}

function sceneText(doc: ScreenplayDocument) {
  const scenes = deriveScenes(doc.blocks);
  const map = new Map<string, { index: number; heading: string; text: string }>();
  const occurrences = new Map<string, number>();
  scenes.forEach((scene: Scene, index) => {
    const end = scenes[index + 1]?.blockIndex ?? doc.blocks.length;
    const occurrence = (occurrences.get(scene.heading) ?? 0) + 1;
    occurrences.set(scene.heading, occurrence);
    map.set(`${scene.heading}\0${occurrence}`, { index, heading: scene.heading, text: doc.blocks.slice(scene.blockIndex, end).map((block) => `${block.type}:${block.text}`).join("\n") });
  });
  return map;
}

export function characterDialogue(blocks: ScreenplayBlock[], character: string): string[] {
  const lines: string[] = [];
  let active = false;
  for (const block of blocks) {
    if (block.type === "character") active = normalizeCharacterName(block.text) === character;
    else if (block.type === "dialogue" && active) lines.push(block.text);
    else if (block.type !== "parenthetical") active = false;
  }
  return lines;
}

/** Move a complete scene card while keeping every block in that scene together. */
export function moveScene(blocks: ScreenplayBlock[], from: number, to: number): ScreenplayBlock[] {
  const scenes = deriveScenes(blocks);
  if (from === to || !scenes[from] || !scenes[to]) return blocks;
  const prefix = blocks.slice(0, scenes[0].blockIndex);
  const chunks = scenes.map((scene, index) => blocks.slice(scene.blockIndex, scenes[index + 1]?.blockIndex ?? blocks.length));
  const [moved] = chunks.splice(from, 1);
  chunks.splice(to, 0, moved);
  return [...prefix, ...chunks.flat()];
}
