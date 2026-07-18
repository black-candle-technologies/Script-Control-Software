import { compileAnalysis, type CoverageHook, type CoverageResult } from "./analysis.ts";
import type { EpisodeMeta, ProjectSession, SeasonMeta, StoryLine } from "./projectWorkspace.ts";
import type { ScreenplayDocument } from "./screenplay.ts";

export interface SeriesShowBible {
  title: string;
  markdown: string;
  seasonArcs: { seasonId: string; title: string; arc: string }[];
  characterArcs: Record<string, string>;
  recurringCharacters: string[];
  recurringLocations: string[];
  recurringObjects: string[];
}

export interface EpisodePlotThreadSummary {
  id: string;
  label: string;
  kind: StoryLine["kind"];
  status: CoverageResult["status"];
  resolved: boolean;
  matchedSceneIds: string[];
  missingSceneIds: string[];
  missingBeatIds: string[];
}

export interface SeriesEpisodeSummary {
  documentId: string;
  seasonId: string;
  seasonNumber: number;
  number: number;
  title: string;
  productionCode: string;
  coldOpen: boolean;
  tag: boolean;
  actBreakSceneIds: string[];
  sceneIds: string[];
  sceneCount: number;
  pageEstimate: number;
  runtimeMinutes: number;
  actCount: number;
  characters: string[];
  locations: string[];
  objects: string[];
  firstScene?: string;
  lastScene?: string;
  plotThreads: EpisodePlotThreadSummary[];
  summary: string;
}

export interface SeriesSeasonSummary {
  id: string;
  number: number;
  title: string;
  arc: string;
  episodeCount: number;
  sceneCount: number;
  pageEstimate: number;
  characters: string[];
  locations: string[];
  objects: string[];
  plotThreadIds: string[];
  episodes: SeriesEpisodeSummary[];
  summary: string;
}

export interface SeriesEntityContinuity {
  name: string;
  episodeIds: string[];
  firstEpisodeId: string;
  lastEpisodeId: string;
  absentEpisodeIdsBetween: string[];
}

export interface SeriesContinuity {
  characters: SeriesEntityContinuity[];
  locations: SeriesEntityContinuity[];
  objects: SeriesEntityContinuity[];
}

export interface SeriesPlotThreadSummary {
  id: string;
  label: string;
  kind: StoryLine["kind"];
  status: "active" | "resolved" | "uncovered";
  firstEpisodeId: string;
  lastEpisodeId: string;
  episodes: { episodeId: string; status: CoverageResult["status"]; resolved: boolean }[];
}

export interface SeasonBoardRow {
  seasonId: string;
  seasonNumber: number;
  episodeId: string;
  episodeNumber: number;
  title: string;
  productionCode: string;
  coldOpen: boolean;
  tag: boolean;
  sceneCount: number;
  pageEstimate: number;
  actCount: number;
  stories: Record<StoryLine["kind"], string[]>;
  characters: string[];
  locations: string[];
  objects: string[];
  continuityIssueCount: number;
}

export type ContinuityIssueCode =
  | "open-record"
  | "missing-episode-reference"
  | "missing-scene-reference"
  | "missing-thread-reference"
  | "duplicate-episode-number"
  | "uncovered-thread"
  | "reopened-thread";

export interface ContinuityIssue {
  id: string;
  code: ContinuityIssueCode;
  severity: "warning" | "error";
  message: string;
  episodeIds: string[];
}

export interface SeriesWorkspaceReport {
  showBible: SeriesShowBible;
  episodes: SeriesEpisodeSummary[];
  seasons: SeriesSeasonSummary[];
  continuity: SeriesContinuity;
  plotThreads: SeriesPlotThreadSummary[];
  seasonBoard: SeasonBoardRow[];
  continuityIssues: ContinuityIssue[];
}

interface EpisodeContext {
  document: ScreenplayDocument;
  meta: EpisodeMeta;
  season: SeasonMeta;
  documentIndex: number;
}

const unique = (values: Iterable<string>) => [...new Set(values)].filter(Boolean);
const sorted = (values: Iterable<string>) => unique(values).sort((a, b) => a.localeCompare(b));

function episodeContexts(session: ProjectSession): EpisodeContext[] {
  const fallbackSeason = session.workspace.series.seasons[0] ?? { id: "season-1", number: 1, title: "Season 1", episodeIds: [], arc: "" };
  return session.documents.map((document, documentIndex) => {
    const documentId = document.id ?? `document-${documentIndex + 1}`;
    const meta = session.workspace.series.episodes[documentId] ?? {
      documentId,
      seasonId: fallbackSeason.id,
      number: documentIndex + 1,
      title: document.titlePage.title || `Episode ${documentIndex + 1}`,
      productionCode: "",
      coldOpen: false,
      tag: false,
      actBreakSceneIds: [],
      storyLines: [],
    };
    const season = session.workspace.series.seasons.find((item) => item.id === meta.seasonId) ?? fallbackSeason;
    return { document, meta, season, documentIndex };
  }).sort((a, b) => a.season.number - b.season.number || a.meta.number - b.meta.number || a.documentIndex - b.documentIndex);
}

function threadHooks(document: ScreenplayDocument, meta: EpisodeMeta) {
  const hooks = new Map<string, { hook: CoverageHook; kind: StoryLine["kind"] }>();
  const add = (hook: CoverageHook, kind: StoryLine["kind"] = "other") => {
    const current = hooks.get(hook.id);
    hooks.set(hook.id, {
      kind: current && current.kind !== "other" ? current.kind : kind,
      hook: {
        ...current?.hook,
        ...hook,
        sceneIds: unique([...(current?.hook.sceneIds ?? []), ...(hook.sceneIds ?? [])]),
        beatIds: unique([...(current?.hook.beatIds ?? []), ...(hook.beatIds ?? [])]),
        keywords: unique([...(current?.hook.keywords ?? []), ...(hook.keywords ?? [])]),
      },
    });
  };
  meta.storyLines.forEach((line) => add({ id: line.id, label: line.label, sceneIds: line.sceneIds }, line.kind));
  document.workspace?.plotThreads?.forEach((hook) => add(hook));
  return hooks;
}

function episodeSummaries(session: ProjectSession): SeriesEpisodeSummary[] {
  return episodeContexts(session).map(({ document, meta, season }) => {
    const hooks = threadHooks(document, meta);
    const analysis = compileAnalysis(document, {
      episodeTitle: meta.title || document.titlePage.title,
      entityOverrides: document.workspace?.entityOverrides,
      plotThreads: [...hooks.values()].map((item) => item.hook),
      resolvedBeatIds: document.workspace?.resolvedBeatIds,
      storyStructure: document.workspace?.storyStructure,
    });
    const active = <T extends { status: string; name: string }>(entities: T[]) => entities.filter((item) => item.status !== "rejected" && item.status !== "merged").map((item) => item.name);
    return {
      documentId: document.id!,
      seasonId: season.id,
      seasonNumber: season.number,
      number: meta.number,
      title: meta.title || analysis.episode.title,
      productionCode: meta.productionCode,
      coldOpen: meta.coldOpen,
      tag: meta.tag,
      actBreakSceneIds: [...meta.actBreakSceneIds],
      sceneIds: analysis.scenes.map((scene) => scene.id),
      sceneCount: analysis.episode.sceneCount,
      pageEstimate: analysis.episode.pageEstimate,
      runtimeMinutes: analysis.episode.runtimeMinutes,
      actCount: analysis.episode.actCount,
      characters: active(analysis.entities.characters),
      locations: active(analysis.entities.locations),
      objects: active(analysis.entities.objects),
      firstScene: analysis.episode.firstScene,
      lastScene: analysis.episode.lastScene,
      plotThreads: analysis.plotThreads.map((thread) => ({
        ...thread,
        kind: hooks.get(thread.id)?.kind ?? "other",
        resolved: thread.resolved === true,
      })),
      summary: analysis.episode.summary,
    };
  });
}

function seasonSummaries(session: ProjectSession, episodes: SeriesEpisodeSummary[]): SeriesSeasonSummary[] {
  const configured = new Map(session.workspace.series.seasons.map((season) => [season.id, season]));
  for (const episode of episodes) if (!configured.has(episode.seasonId)) configured.set(episode.seasonId, { id: episode.seasonId, number: episode.seasonNumber, title: `Season ${episode.seasonNumber}`, episodeIds: [], arc: "" });
  return [...configured.values()].sort((a, b) => a.number - b.number).map((season) => {
    const rows = episodes.filter((episode) => episode.seasonId === season.id);
    const sceneCount = rows.reduce((total, episode) => total + episode.sceneCount, 0);
    const pageEstimate = rows.reduce((total, episode) => total + episode.pageEstimate, 0);
    return {
      id: season.id,
      number: season.number,
      title: season.title,
      arc: season.arc,
      episodeCount: rows.length,
      sceneCount,
      pageEstimate,
      characters: sorted(rows.flatMap((episode) => episode.characters)),
      locations: sorted(rows.flatMap((episode) => episode.locations)),
      objects: sorted(rows.flatMap((episode) => episode.objects)),
      plotThreadIds: unique(rows.flatMap((episode) => episode.plotThreads.map((thread) => thread.id))),
      episodes: rows,
      summary: `${season.title}: ${rows.length} episode${rows.length === 1 ? "" : "s"}, ${sceneCount} scenes, and ${pageEstimate} estimated pages.`,
    };
  });
}

function entityContinuity(episodes: SeriesEpisodeSummary[], field: "characters" | "locations" | "objects"): SeriesEntityContinuity[] {
  const appearances = new Map<string, { name: string; episodeIds: string[] }>();
  episodes.forEach((episode) => episode[field].forEach((name) => {
    const key = name.trim().toUpperCase();
    const entry = appearances.get(key) ?? { name, episodeIds: [] };
    entry.episodeIds.push(episode.documentId);
    appearances.set(key, entry);
  }));
  return [...appearances.values()].map((entry) => {
    const first = episodes.findIndex((episode) => episode.documentId === entry.episodeIds[0]);
    const lastEpisodeId = entry.episodeIds[entry.episodeIds.length - 1];
    const last = episodes.findIndex((episode) => episode.documentId === lastEpisodeId);
    return {
      name: entry.name,
      episodeIds: entry.episodeIds,
      firstEpisodeId: entry.episodeIds[0],
      lastEpisodeId,
      absentEpisodeIdsBetween: episodes.slice(first, last + 1).map((episode) => episode.documentId).filter((id) => !entry.episodeIds.includes(id)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function plotThreadSummaries(episodes: SeriesEpisodeSummary[]): SeriesPlotThreadSummary[] {
  const threads = new Map<string, SeriesPlotThreadSummary>();
  episodes.forEach((episode) => episode.plotThreads.forEach((thread) => {
    const current = threads.get(thread.id) ?? {
      id: thread.id,
      label: thread.label,
      kind: thread.kind,
      status: "active" as const,
      firstEpisodeId: episode.documentId,
      lastEpisodeId: episode.documentId,
      episodes: [],
    };
    current.lastEpisodeId = episode.documentId;
    current.episodes.push({ episodeId: episode.documentId, status: thread.status, resolved: thread.resolved });
    const latest = current.episodes[current.episodes.length - 1];
    current.status = latest.resolved ? "resolved" : current.episodes.every((item) => item.status === "uncovered") ? "uncovered" : "active";
    threads.set(thread.id, current);
  }));
  return [...threads.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function findContinuityIssues(session: ProjectSession, episodes: SeriesEpisodeSummary[], threads: SeriesPlotThreadSummary[]): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const liveEpisodes = new Set(episodes.map((episode) => episode.documentId));
  for (const record of session.workspace.series.continuity) {
    const missing = record.episodeIds.filter((id) => !liveEpisodes.has(id));
    if (!record.resolved) issues.push({ id: `open-record:${record.id}`, code: "open-record", severity: "warning", message: `${record.title} is unresolved.`, episodeIds: record.episodeIds.filter((id) => liveEpisodes.has(id)) });
    if (missing.length) issues.push({ id: `missing-episode:${record.id}`, code: "missing-episode-reference", severity: "error", message: `${record.title} references missing episode${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`, episodeIds: missing });
  }
  const numbers = new Map<string, SeriesEpisodeSummary[]>();
  episodes.forEach((episode) => {
    const key = `${episode.seasonId}\0${episode.number}`;
    numbers.set(key, [...(numbers.get(key) ?? []), episode]);
  });
  for (const rows of numbers.values()) if (rows.length > 1) issues.push({ id: `duplicate-number:${rows[0].seasonId}:${rows[0].number}`, code: "duplicate-episode-number", severity: "error", message: `Season ${rows[0].seasonNumber} has ${rows.length} episodes numbered ${rows[0].number}.`, episodeIds: rows.map((row) => row.documentId) });
  episodes.forEach((episode) => {
    const sceneIds = new Set(episode.sceneIds);
    const missingBreaks = episode.actBreakSceneIds.filter((id) => !sceneIds.has(id));
    if (missingBreaks.length) issues.push({ id: `missing-break:${episode.documentId}`, code: "missing-scene-reference", severity: "error", message: `${episode.title} has missing act-break scene references.`, episodeIds: [episode.documentId] });
    episode.plotThreads.forEach((thread) => {
      if (thread.missingSceneIds.length || thread.missingBeatIds.length) issues.push({ id: `missing-thread:${episode.documentId}:${thread.id}`, code: "missing-thread-reference", severity: "error", message: `${thread.label} has missing scene or beat references in ${episode.title}.`, episodeIds: [episode.documentId] });
      else if (thread.status === "uncovered" && !thread.resolved) issues.push({ id: `uncovered:${episode.documentId}:${thread.id}`, code: "uncovered-thread", severity: "warning", message: `${thread.label} has no coverage in ${episode.title}.`, episodeIds: [episode.documentId] });
    });
  });
  threads.forEach((thread) => {
    const firstResolved = thread.episodes.findIndex((episode) => episode.resolved);
    const reopened = firstResolved >= 0 ? thread.episodes.slice(firstResolved + 1).find((episode) => !episode.resolved) : undefined;
    if (reopened) issues.push({ id: `reopened:${thread.id}:${reopened.episodeId}`, code: "reopened-thread", severity: "warning", message: `${thread.label} appears unresolved after it was marked resolved.`, episodeIds: [reopened.episodeId] });
  });
  return issues;
}

function showBible(session: ProjectSession, seasons: SeriesSeasonSummary[], continuity: SeriesContinuity): SeriesShowBible {
  return {
    title: session.name,
    markdown: session.workspace.series.showBible,
    seasonArcs: seasons.map((season) => ({ seasonId: season.id, title: season.title, arc: season.arc })),
    characterArcs: { ...session.workspace.series.characterArcs },
    recurringCharacters: continuity.characters.filter((entry) => entry.episodeIds.length > 1).map((entry) => entry.name),
    recurringLocations: continuity.locations.filter((entry) => entry.episodeIds.length > 1).map((entry) => entry.name),
    recurringObjects: continuity.objects.filter((entry) => entry.episodeIds.length > 1).map((entry) => entry.name),
  };
}

function seasonBoard(episodes: SeriesEpisodeSummary[], issues: ContinuityIssue[]): SeasonBoardRow[] {
  return episodes.map((episode) => {
    const stories: SeasonBoardRow["stories"] = { A: [], B: [], C: [], other: [] };
    episode.plotThreads.forEach((thread) => stories[thread.kind].push(thread.label));
    return {
      seasonId: episode.seasonId,
      seasonNumber: episode.seasonNumber,
      episodeId: episode.documentId,
      episodeNumber: episode.number,
      title: episode.title,
      productionCode: episode.productionCode,
      coldOpen: episode.coldOpen,
      tag: episode.tag,
      sceneCount: episode.sceneCount,
      pageEstimate: episode.pageEstimate,
      actCount: episode.actCount,
      stories,
      characters: episode.characters,
      locations: episode.locations,
      objects: episode.objects,
      continuityIssueCount: issues.filter((issue) => issue.episodeIds.includes(episode.documentId)).length,
    };
  });
}

export function compileSeriesWorkspace(session: ProjectSession): SeriesWorkspaceReport {
  const episodes = episodeSummaries(session);
  const seasons = seasonSummaries(session, episodes);
  const continuity = {
    characters: entityContinuity(episodes, "characters"),
    locations: entityContinuity(episodes, "locations"),
    objects: entityContinuity(episodes, "objects"),
  };
  const plotThreads = plotThreadSummaries(episodes);
  const continuityIssues = findContinuityIssues(session, episodes, plotThreads);
  return { showBible: showBible(session, seasons, continuity), episodes, seasons, continuity, plotThreads, seasonBoard: seasonBoard(episodes, continuityIssues), continuityIssues };
}

export const summarizeSeriesEpisodes = (session: ProjectSession) => compileSeriesWorkspace(session).episodes;
export const summarizeSeriesSeasons = (session: ProjectSession) => compileSeriesWorkspace(session).seasons;
export const deriveSeriesContinuity = (session: ProjectSession) => compileSeriesWorkspace(session).continuity;
export const trackSeriesPlotThreads = (session: ProjectSession) => compileSeriesWorkspace(session).plotThreads;
export const buildSeasonBoard = (session: ProjectSession) => compileSeriesWorkspace(session).seasonBoard;
export const detectSeriesContinuityIssues = (session: ProjectSession) => compileSeriesWorkspace(session).continuityIssues;
