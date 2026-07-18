import {
  deriveScenes,
  emptyWorkspace,
  normalizeCharacterName,
  paginateBlocks,
  parseHeading,
  type ScreenplayBlock,
  type ScreenplayDocument,
  type TextRun,
} from "./screenplay.ts";

export const REVISION_COLORS = ["White", "Blue", "Pink", "Yellow", "Green", "Goldenrod", "Buff", "Salmon", "Cherry"] as const;
export type RevisionColor = typeof REVISION_COLORS[number];

export interface RevisionSet {
  id: string;
  label: string;
  color: RevisionColor;
  createdAt: string;
  blockIds: string[];
  baselineSnapshotId?: string;
}

export interface PageLock {
  pages: { number: number; blockIds: string[] }[];
}

export interface ProductionPage {
  label: string;
  basePage: number;
  blockIds: string[];
  locked: boolean;
  revisionIds: string[];
  color?: RevisionColor;
}

export interface ProductionRevisionSummary {
  revisionId: string;
  label: string;
  color: RevisionColor;
  addedBlockIds: string[];
  editedBlockIds: string[];
  removedBlockIds: string[];
  changedSceneIds: string[];
  revisedPages: string[];
  totalChanges: number;
}

export interface RevisionExportMetadata {
  draftLabel: string;
  omittedSceneIds: string[];
  lockedPages: string[];
  revisions: RevisionSet[];
  pages: Pick<ProductionPage, "label" | "locked" | "revisionIds" | "color">[];
}

export interface SceneStrip {
  sceneId: string;
  sceneNumber: string;
  heading: string;
  interiorExterior: string;
  location: string;
  timeOfDay: string;
  characters: string[];
  eighths: number;
  blockIds: string[];
  omitted: boolean;
}

export interface OneLineScheduleRow extends SceneStrip {
  day: number;
  line: string;
}

export type CastDayStatus = "SW" | "W" | "WF" | "SWF";

export interface CastDay {
  character: string;
  totalDays: number;
  days: { day: number; status: CastDayStatus; sceneNumbers: string[] }[];
}

export interface ProductionReports {
  sceneStrips: SceneStrip[];
  oneLineSchedule: OneLineScheduleRow[];
  castDays: CastDay[];
}

export type ProductionExportKind = "revision" | "scene-strips" | "schedule" | "cast-days" | "character-sides" | "scene-sides" | "dialogue" | "departments" | "metadata";

export const nextRevisionColor = (color: RevisionColor): RevisionColor =>
  REVISION_COLORS[(REVISION_COLORS.indexOf(color) + 1) % REVISION_COLORS.length];

export function markChangedBlocks(previous: ScreenplayDocument, current: ScreenplayDocument, revision: RevisionSet) {
  const before = new Map(previous.blocks.map((block) => [block.id, block]));
  const changed = current.blocks.filter((block) => !before.has(block.id) || blockFingerprint(before.get(block.id)!) !== blockFingerprint(block)).map((block) => block.id);
  const changedIds = new Set(changed);
  return {
    document: { ...current, blocks: current.blocks.map((block) => changedIds.has(block.id) ? stampRevision(block, revision.id) : block) },
    revision: { ...revision, blockIds: [...new Set([...revision.blockIds, ...changed])] },
  };
}

export function lockPages(document: ScreenplayDocument): PageLock {
  return {
    pages: paginateBlocks(document.blocks).filter((blocks) => blocks.length).map((blocks, index) => ({
      number: index + 1,
      blockIds: blocks.map((block) => block.id),
    })),
  };
}

export function productionPages(document: ScreenplayDocument, lock?: PageLock, revisions: readonly RevisionSet[] = []): ProductionPage[] {
  if (!lock?.pages.length) {
    return paginateBlocks(document.blocks).filter((blocks) => blocks.length).map((blocks, index) => page(index + 1, 0, blocks, false, revisions));
  }
  const baseByBlock = new Map(lock.pages.flatMap((locked) => locked.blockIds.map((id) => [id, locked.number] as const)));
  const groups: { basePage: number; blocks: ScreenplayBlock[] }[] = [];
  let basePage = lock.pages[0].number;
  for (const block of document.blocks) {
    const anchoredPage = baseByBlock.get(block.id);
    if (anchoredPage !== undefined && anchoredPage > basePage) basePage = anchoredPage;
    const group = groups[groups.length - 1];
    if (group?.basePage === basePage) group.blocks.push(block);
    else groups.push({ basePage, blocks: [block] });
  }
  // ponytail: inserted blocks inherit the preceding locked page; add explicit anchors if fully deleted pages must retain labels.
  return groups.flatMap((group) => paginateBlocks(group.blocks).filter((blocks) => blocks.length).map((blocks, index) => page(group.basePage, index, blocks, index === 0, revisions)));
}

export function setSceneOmitted(document: ScreenplayDocument, sceneId: string, omitted = true): ScreenplayDocument {
  if (!deriveScenes(document.blocks).some((scene) => scene.id === sceneId)) return document;
  const ids = new Set(document.workspace?.omittedSceneIds ?? []);
  if (omitted) ids.add(sceneId);
  else ids.delete(sceneId);
  return {
    ...document,
    workspace: { ...emptyWorkspace(), ...document.workspace, omittedSceneIds: [...ids] },
  };
}

export const isSceneOmitted = (document: ScreenplayDocument, sceneId: string) =>
  document.workspace?.omittedSceneIds?.includes(sceneId) ?? false;

export function summarizeRevision(previous: ScreenplayDocument, current: ScreenplayDocument, revision: RevisionSet, lock?: PageLock): ProductionRevisionSummary {
  const before = new Map(previous.blocks.map((block) => [block.id, block]));
  const after = new Map(current.blocks.map((block) => [block.id, block]));
  const addedBlockIds = current.blocks.filter((block) => !before.has(block.id)).map((block) => block.id);
  const editedBlockIds = current.blocks.filter((block) => before.has(block.id) && blockFingerprint(before.get(block.id)!) !== blockFingerprint(block)).map((block) => block.id);
  const removedBlockIds = previous.blocks.filter((block) => !after.has(block.id)).map((block) => block.id);
  const changedIds = new Set([...revision.blockIds, ...addedBlockIds, ...editedBlockIds]);
  const changedSceneIds = new Set([
    ...scenesForBlocks(current, changedIds),
    ...scenesForBlocks(previous, new Set(removedBlockIds)),
  ]);
  const currentPages = productionPages(current, lock, [revision]);
  const revisedPageLabels = new Set(currentPages.filter((item) => item.revisionIds.includes(revision.id)).map((item) => item.label));
  const removedIds = new Set(removedBlockIds);
  productionPages(previous, lock).forEach((previousPage, index) => {
    if (!previousPage.blockIds.some((id) => removedIds.has(id))) return;
    const target = currentPages.find((page) => page.label === previousPage.label)
      ?? currentPages.find((page) => page.basePage === previousPage.basePage)
      ?? currentPages[Math.min(index, Math.max(0, currentPages.length - 1))];
    if (target) revisedPageLabels.add(target.label);
  });
  const revisedPages = currentPages.filter((page) => revisedPageLabels.has(page.label)).map((page) => page.label);
  return {
    revisionId: revision.id,
    label: revision.label,
    color: revision.color,
    addedBlockIds,
    editedBlockIds,
    removedBlockIds,
    changedSceneIds: [...changedSceneIds],
    revisedPages,
    totalChanges: addedBlockIds.length + editedBlockIds.length + removedBlockIds.length,
  };
}

export function revisionExportMetadata(document: ScreenplayDocument, revisions: readonly RevisionSet[], lock?: PageLock): RevisionExportMetadata {
  const pages = productionPages(document, lock, revisions);
  return {
    draftLabel: document.workspace?.productionDraftLabel?.trim() || "Production Draft",
    omittedSceneIds: [...(document.workspace?.omittedSceneIds ?? [])],
    lockedPages: pages.filter((item) => item.locked).map((item) => item.label),
    revisions: revisions.map((revision) => ({ ...revision, blockIds: [...revision.blockIds] })),
    pages: pages.map(({ label, locked, revisionIds, color }) => ({ label, locked, revisionIds: [...revisionIds], ...(color ? { color } : {}) })),
  };
}

export function productionReports(document: ScreenplayDocument, eighthsPerDay = 40): ProductionReports {
  const omitted = new Set(document.workspace?.omittedSceneIds ?? []);
  const scenes = deriveScenes(document.blocks);
  const sceneStrips = scenes.map((scene, index): SceneStrip => {
    const blocks = document.blocks.slice(scene.blockIndex, scenes[index + 1]?.blockIndex ?? document.blocks.length);
    const heading = parseHeading(scene.heading);
    const words = blocks.reduce((total, block) => total + (block.text.trim().match(/\S+/g)?.length ?? 0), 0);
    return {
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber ?? String(scene.number),
      heading: scene.heading,
      interiorExterior: heading.intExt,
      location: heading.location,
      timeOfDay: heading.timeOfDay,
      characters: [...scene.characters],
      eighths: Math.max(1, Math.ceil((words / 250) * 8)),
      blockIds: blocks.map((block) => block.id),
      omitted: omitted.has(scene.id),
    };
  });
  const capacity = Number.isFinite(eighthsPerDay) && eighthsPerDay > 0 ? Math.floor(eighthsPerDay) : 40;
  let day = 1;
  let used = 0;
  const oneLineSchedule = sceneStrips.filter((strip) => !strip.omitted).map((strip): OneLineScheduleRow => {
    if (used && used + strip.eighths > capacity) {
      day++;
      used = 0;
    }
    used += strip.eighths;
    return { ...strip, day, line: `${strip.sceneNumber} ${strip.heading} — ${strip.characters.join(", ") || "No cast"} — ${strip.eighths}/8` };
  });
  const cast = new Map<string, Map<number, string[]>>();
  for (const row of oneLineSchedule) {
    for (const character of row.characters) {
      const days = cast.get(character) ?? new Map<number, string[]>();
      days.set(row.day, [...(days.get(row.day) ?? []), row.sceneNumber]);
      cast.set(character, days);
    }
  }
  const castDays = [...cast].sort(([a], [b]) => a.localeCompare(b)).map(([character, days]): CastDay => {
    const entries = [...days].sort(([a], [b]) => a - b);
    return {
      character,
      totalDays: entries.length,
      days: entries.map(([shootDay, sceneNumbers], index) => ({
        day: shootDay,
        status: entries.length === 1 ? "SWF" : index === 0 ? "SW" : index === entries.length - 1 ? "WF" : "W",
        sceneNumbers,
      })),
    };
  });
  return { sceneStrips, oneLineSchedule, castDays };
}

export function revisionReportMarkdown(summaries: readonly ProductionRevisionSummary[]): string {
  const lines = ["# Revision History", ""];
  for (const summary of summaries) {
    lines.push(`## ${summary.label} (${summary.color})`, "", `- Total changes: ${summary.totalChanges}`, `- Added blocks: ${summary.addedBlockIds.length}`, `- Edited blocks: ${summary.editedBlockIds.length}`, `- Removed blocks: ${summary.removedBlockIds.length}`, `- Revised pages: ${summary.revisedPages.join(", ") || "None"}`, `- Changed scenes: ${summary.changedSceneIds.join(", ") || "None"}`, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function productionReportsCsv(reports: ProductionReports, section: "strips" | "schedule" | "cast-days" = "strips"): string {
  if (section === "cast-days") return csv([
    ["Character", "Total Days", "Day", "Status", "Scenes"],
    ...reports.castDays.flatMap((cast) => cast.days.map((day) => [cast.character, cast.totalDays, day.day, day.status, day.sceneNumbers.join("; ")])),
  ]);
  const rows = section === "schedule" ? reports.oneLineSchedule : reports.sceneStrips;
  return csv([
    ["Day", "Scene", "Heading", "INT/EXT", "Location", "Time", "Characters", "Eighths", "Omitted"],
    ...rows.map((row) => ["day" in row ? Number(row.day) : "", row.sceneNumber, row.heading, row.interiorExterior, row.location, row.timeOfDay, row.characters.join("; "), row.eighths, row.omitted]),
  ]);
}

export function buildCharacterSides(document: ScreenplayDocument): Record<string, string> {
  const sides = new Map<string, string[]>();
  let scene = "UNSPECIFIED SCENE";
  let character = "";
  for (const block of document.blocks) {
    if (block.type === "scene_heading") {
      scene = block.text;
      character = "";
    } else if (block.type === "character") {
      character = normalizeCharacterName(block.text);
      if (character) {
        const lines = sides.get(character) ?? [];
        if (lines[lines.length - 1] !== scene) lines.push(scene);
        lines.push(character);
        sides.set(character, lines);
      }
    } else if ((block.type === "dialogue" || block.type === "parenthetical") && character) {
      sides.get(character)!.push(block.text);
    } else if (block.type !== "parenthetical") character = "";
  }
  return Object.fromEntries([...sides].map(([name, lines]) => [name, `${lines.join("\n")}\n`]));
}

export function buildSceneSides(document: ScreenplayDocument): Record<string, string> {
  const scenes = deriveScenes(document.blocks);
  return Object.fromEntries(scenes.map((scene, index) => {
    const blocks = document.blocks.slice(scene.blockIndex, scenes[index + 1]?.blockIndex ?? document.blocks.length);
    return [scene.id, `${blocks.map((block) => block.text).join("\n\n")}\n`];
  }));
}

export function dialogueOnly(document: ScreenplayDocument): string {
  return `${document.blocks.filter((block) => block.type === "character" || block.type === "dialogue" || block.type === "parenthetical").map((block) => block.text).join("\n")}\n`;
}

function csv(rows: (string | number | boolean)[][]): string {
  return `${rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n")}\n`;
}

function stampRevision(block: ScreenplayBlock, revisionId: string): ScreenplayBlock {
  const runs: TextRun[] = block.textRuns?.length && block.textRuns.map((run) => run.text).join("") === block.text
    ? block.textRuns
    : [{ text: block.text, bold: false, italic: false, underline: false, strikeout: false, metadata: {} }];
  return {
    ...block,
    textRuns: runs.map((run) => ({ ...run, revisionId, metadata: { ...run.metadata, RevisionID: revisionId } })),
  };
}

function blockFingerprint(block: ScreenplayBlock): string {
  const metadata = (value: Record<string, string> | undefined) => Object.entries(value ?? {}).filter(([key]) => key.toLowerCase() !== "revisionid").sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    block.type,
    block.text,
    block.originalType,
    metadata(block.metadata),
    block.textRuns?.map((run) => [run.text, run.bold, run.italic, run.underline, run.strikeout, metadata(run.metadata)]) ?? [],
  ]);
}

function page(basePage: number, overflow: number, blocks: ScreenplayBlock[], locked: boolean, revisions: readonly RevisionSet[]): ProductionPage {
  const blockIds = blocks.map((block) => block.id);
  const ids = new Set(blockIds);
  const applied = revisions.filter((revision) => revision.blockIds.some((id) => ids.has(id)));
  const latest = applied[applied.length - 1];
  return {
    label: overflow ? `${basePage}${pageSuffix(overflow)}` : String(basePage),
    basePage,
    blockIds,
    locked,
    revisionIds: applied.map((revision) => revision.id),
    ...(latest ? { color: latest.color } : {}),
  };
}

function pageSuffix(index: number): string {
  let value = index;
  let suffix = "";
  while (value) {
    value--;
    suffix = String.fromCharCode(65 + value % 26) + suffix;
    value = Math.floor(value / 26);
  }
  return suffix;
}

function scenesForBlocks(document: ScreenplayDocument, blockIds: Set<string>): string[] {
  const scenes = deriveScenes(document.blocks);
  return scenes.flatMap((scene, index) => {
    const end = scenes[index + 1]?.blockIndex ?? document.blocks.length;
    return document.blocks.slice(scene.blockIndex, end).some((block) => blockIds.has(block.id)) ? [scene.id] : [];
  });
}
