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
  type TextRun,
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
  prop: ["key", "box", "bottle", "bag", "briefcase", "package"],
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

const XML_NAME = /^[:_\p{L}][:_\p{L}\p{N}.\-\u00B7\u0300-\u036F\u203F-\u2040]*$/u;
const INVALID_XML_CHARACTER = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

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

export interface FdxExportResult {
  xml: string;
  warnings: string[];
}

const FDX_TYPES: Partial<Record<ScreenplayBlock["type"], string>> = {
  scene_heading: "Scene Heading", action: "Action", character: "Character", dialogue: "Dialogue",
  parenthetical: "Parenthetical", transition: "Transition", shot: "Shot", general: "General",
  lyrics: "Lyrics", cast_list: "Cast List", new_act: "New Act", end_of_act: "End of Act", note: "General",
};

export function toFdxWithWarnings(doc: ScreenplayDocument): FdxExportResult {
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);
  const rootMetadata = new Map(Object.entries(doc.metadata ?? {}));
  if (!rootMetadata.has("DocumentType")) rootMetadata.set("DocumentType", "Script");
  if (!rootMetadata.has("Template")) rootMetadata.set("Template", "No");
  if (!rootMetadata.has("Version")) rootMetadata.set("Version", doc.source?.fdxVersion ?? "1");
  const fdxVersion = Number.parseFloat(rootMetadata.get("Version") ?? "0");
  if ((doc.workspace?.storyStructure?.beats.length ?? 0) > 0
    && (!Number.isFinite(fdxVersion) || fdxVersion < 3)) rootMetadata.set("Version", "3");
  const paragraphs = doc.blocks.map((block, index) => paragraphXml(block, index, warn)).join("\n");
  const titlePage = titlePageXml(doc, warn);
  const beatBoard = beatBoardXml(doc, warn);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<FinalDraft${attributes(rootMetadata, warn, "FinalDraft")}>\n${titlePage}  <Content>\n${paragraphs}\n  </Content>\n${beatBoard}</FinalDraft>\n`;
  return { xml, warnings };
}

export function toFdx(doc: ScreenplayDocument): string {
  return toFdxWithWarnings(doc).xml;
}

function beatBoardXml(doc: ScreenplayDocument, warn: (message: string) => void): string {
  const structure = doc.workspace?.storyStructure;
  const beats = structure?.beats ?? [];
  if (!beats.length) return "";
  const beatIds = new Set(beats.map((beat) => beat.id));
  const rects = beats.map((beat, index) => {
    const board = beat.board;
    return board && [board.left, board.top, board.width, board.height].every(Number.isFinite) && board.width > 0 && board.height > 0
      ? board
      : { left: 40 + (index % 4) * 280, top: 40 + Math.floor(index / 4) * 190, width: 240, height: 150 };
  });
  const beatItems = beats.map((beat, index) => {
    const hasExplicitTitle = beat.title !== undefined;
    const legacyLines = beat.text.split(/\r?\n/);
    const title = hasExplicitTitle ? beat.title!.trim() || "Untitled Beat" : legacyLines.shift()?.trim() || `Beat ${index + 1}`;
    const body = hasExplicitTitle ? beat.text : legacyLines.join("\n");
    const metadata = new Map([
      ["Color", fdxColor(beat.color, warn, `Beat ${index + 1}`)],
      ["Id", beat.id],
      ["Title", title],
      ["Type", "Beat"],
    ]);
    const paragraphs = body
      ? body.split(/\r?\n/).map((line, lineIndex) => `        <Paragraph><Text>${xmlText(line, warn, `Beat ${index + 1}, line ${lineIndex + 1}`)}</Text></Paragraph>`).join("\n")
      : "";
    return paragraphs
      ? `    <ListItem${attributes(metadata, warn, `Beat ${index + 1}`)}>\n      <Content>\n${paragraphs}\n      </Content>\n    </ListItem>`
      : `    <ListItem${attributes(metadata, warn, `Beat ${index + 1}`)}><Content/></ListItem>`;
  });
  const exportedConnections = (structure?.connections ?? []).flatMap((connection, index) => {
    if (!beatIds.has(connection.fromId) || !beatIds.has(connection.toId)) {
      warn(`Board connection ${index + 1}: only connections between exported beats can be written to FDX.`);
      return [];
    }
    const metadataEntries: [string, string][] = [
      ["Color", fdxColor(connection.color, warn, `Board connection ${index + 1}`)],
      ["EndPoint", connection.toId],
      ["Id", connection.id],
      ["StartPoint", connection.fromId],
      ["Type", "PeerLink"],
    ];
    if (connection.endCap) metadataEntries.push(["EndCap", connection.endCap]);
    if (connection.frontCap) metadataEntries.push(["FrontCap", connection.frontCap]);
    const metadata = new Map(metadataEntries);
    return [{ connection, xml: `    <ListItem${attributes(metadata, warn, `Board connection ${index + 1}`)}/>` }];
  });
  const requestedBoard = structure?.board;
  const contentWidth = Math.max(1200, ...rects.map((rect) => rect.left + rect.width + 80));
  const contentHeight = Math.max(800, ...rects.map((rect) => rect.top + rect.height + 80));
  const boardMetadata = new Map([
    ["Height", String(requestedBoard?.height && Number.isFinite(requestedBoard.height) ? Math.max(requestedBoard.height, contentHeight) : contentHeight)],
    ["Id", requestedBoard?.id || "scs-beat-board"],
    ["ScrollOrigin", requestedBoard?.scrollOrigin || "0,0"],
    ["Type", "Beat"],
    ["Width", String(requestedBoard?.width && Number.isFinite(requestedBoard.width) ? Math.max(requestedBoard.width, contentWidth) : contentWidth)],
    ["ZoomLevel", String(requestedBoard?.zoomLevel && Number.isFinite(requestedBoard.zoomLevel) ? requestedBoard.zoomLevel : 100)],
  ]);
  const beatBoardItems = beats.map((beat, index) => {
    const rect = rects[index];
    return `      <Item Height="${rect.height}" Id="${xmlText(beat.id, warn, `Beat ${index + 1} board id`)}" Left="${rect.left}" Top="${rect.top}" Width="${rect.width}"/>`;
  });
  const connectionBoardItems = exportedConnections.flatMap(({ connection }, index) => {
    const rect = connection.board;
    if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return [];
    return [`      <Item Height="${rect.height}" Id="${xmlText(connection.id, warn, `Board connection ${index + 1} board id`)}" Left="${rect.left}" Top="${rect.top}" Width="${rect.width}"/>`];
  });
  return `  <ListItems>\n${[...beatItems, ...exportedConnections.map(({ xml }) => xml)].join("\n")}\n  </ListItems>\n  <DisplayBoards>\n    <DisplayBoard${attributes(boardMetadata, warn, "Beat board")}>\n${[...beatBoardItems, ...connectionBoardItems].join("\n")}\n    </DisplayBoard>\n  </DisplayBoards>\n`;
}

function fdxColor(value: string | undefined, warn: (message: string) => void, context: string): string {
  if (!value) return "#FFFFFFFFFFFF";
  const twelve = /^#([0-9a-f]{12})$/i.exec(value);
  if (twelve) return `#${twelve[1].toUpperCase()}`;
  const six = /^#([0-9a-f]{6})$/i.exec(value);
  if (six) return `#${six[1].match(/../g)!.map((pair) => pair + pair).join("").toUpperCase()}`;
  warn(`${context}: '${value}' is not a valid board color and was exported as white.`);
  return "#FFFFFFFFFFFF";
}

function paragraphXml(block: ScreenplayBlock, index: number, warn: (message: string) => void): string {
  const context = `Block ${index + 1}`;
  const type = paragraphType(block, context, warn);
  const metadata = new Map([["Type", type], ...Object.entries(block.metadata ?? {}).filter(([name]) => name !== "Type")]);
  const runs = block.textRuns;
  let text = `<Text>${xmlText(block.text, warn, context)}</Text>`;
  if (runs?.length && runs.map((run) => run.text).join("") === block.text) {
    text = runs.map((run, runIndex) => textRunXml(run, warn, `${context}, text run ${runIndex + 1}`)).join("");
  } else if (runs?.some(hasRunFormatting)) {
    warn(`${context}: styled text no longer matches the edited paragraph and was exported as plain text.`);
  }
  return `      <Paragraph${attributes(metadata, warn, context)}>${text}</Paragraph>`;
}

function paragraphType(block: ScreenplayBlock, context: string, warn: (message: string) => void): string {
  const original = block.originalType?.trim() || block.metadata?.Type?.trim();
  if (block.type === "unknown") {
    if (original) return original;
    warn(`${context}: an unsupported paragraph had no original FDX type and was exported as General.`);
    return "General";
  }
  const canonical = FDX_TYPES[block.type] ?? "General";
  return original?.toLowerCase() === canonical.toLowerCase() ? original : canonical;
}

function textRunXml(run: TextRun, warn: (message: string) => void, context: string): string {
  const metadata = new Map(Object.entries(run.metadata ?? {}));
  if (!metadata.has("Style")) {
    const styles = [run.bold && "Bold", run.italic && "Italic", run.underline && "Underline", run.strikeout && "Strikeout"].filter(Boolean).join("+");
    if (styles) metadata.set("Style", styles);
  }
  if (run.revisionId !== undefined) metadata.set("RevisionID", run.revisionId);
  return `<Text${attributes(metadata, warn, context)}>${xmlText(run.text, warn, context)}</Text>`;
}

function hasRunFormatting(run: TextRun): boolean {
  return run.bold || run.italic || run.underline || run.strikeout || run.revisionId !== undefined || Object.keys(run.metadata ?? {}).length > 0;
}

function titlePageXml(doc: ScreenplayDocument, warn: (message: string) => void): string {
  const imported = doc.titlePage.blocks;
  if (imported) {
    let usedTitle = false;
    let usedAuthor = false;
    const paragraphs = imported.map((block, index) => {
      const type = block.type || block.metadata.Type || "General";
      let text = block.text;
      if (!usedTitle && type.toLowerCase() === "title") {
        usedTitle = true;
        if (doc.titlePage.title.trim() !== block.text.trim()) text = doc.titlePage.title;
      } else if (!usedAuthor && ["author", "written by"].includes(type.toLowerCase())) {
        usedAuthor = true;
        if (doc.titlePage.author.trim() !== block.text.trim()) text = doc.titlePage.author;
      }
      const metadata = new Map([["Type", type], ...Object.entries(block.metadata ?? {}).filter(([name]) => name !== "Type")]);
      return `<Paragraph${attributes(metadata, warn, `Title-page block ${index + 1}`)}><Text>${xmlText(text, warn, `Title-page block ${index + 1}`)}</Text></Paragraph>`;
    }).join("");
    return paragraphs ? `  <TitlePage><Content>${paragraphs}</Content></TitlePage>\n` : "";
  }
  const title = doc.titlePage.title.trim();
  const author = doc.titlePage.author.trim();
  if (!title && !author) return "";
  const paragraphs = `${title ? `<Paragraph Type="Title"><Text>${xmlText(title, warn, "Title")}</Text></Paragraph>` : ""}${author ? `<Paragraph Type="Author"><Text>${xmlText(author, warn, "Author")}</Text></Paragraph>` : ""}`;
  return `  <TitlePage><Content>${paragraphs}</Content></TitlePage>\n`;
}

function attributes(metadata: Map<string, string>, warn: (message: string) => void, context: string): string {
  return [...metadata].flatMap(([name, value]) => {
    if (!XML_NAME.test(name)) {
      warn(`${context}: metadata attribute '${name}' is not a valid XML name and was omitted.`);
      return [];
    }
    return [` ${name}="${xmlText(value, warn, `${context} attribute ${name}`)}"`];
  }).join("");
}

function xmlText(value: string, warn: (message: string) => void, context: string): string {
  let changed = false;
  const valid = value.replace(INVALID_XML_CHARACTER, () => {
    changed = true;
    return "\uFFFD";
  });
  if (changed) warn(`${context}: invalid XML characters were replaced.`);
  return esc(valid);
}

export function breakdownMarkdown(title: string, breakdown: Breakdown): string {
  const categories = Object.entries(breakdown.categories).filter(([, count]) => count).map(([name, count]) => `- ${name}: ${count}`).join("\n") || "- None detected";
  return `# ${title}: Breakdown\n\n- Scenes: ${breakdown.scenes}\n- Estimated pages: ${breakdown.pages}\n- Words: ${breakdown.words}\n- Dialogue words: ${breakdown.dialogueWords}\n- Characters: ${breakdown.characters}\n- Locations: ${breakdown.locations}\n- Night scenes: ${breakdown.nightScenes}\n\n## Production categories\n\n${categories}\n`;
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
