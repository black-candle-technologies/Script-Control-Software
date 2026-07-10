/**
 * Television model placeholders.
 *
 * Television is a first-class concern in SCS, not an afterthought bolted onto a
 * feature-film tool. These types sketch the shape of a series workspace so the
 * rest of the architecture can leave room for it. None of this has behaviour in
 * Phase 0 — it is a drafted model only.
 *
 * See also: docs/DOMAIN_MODELS.md.
 */

export interface Show {
  id: string;
  title: string;
  /** The shared show bible — world, rules, tone and canon. Placeholder for now. */
  bible: ShowBible;
  seasons: Season[];
  /** Characters that recur across episodes and seasons. */
  recurringCharacters: RecurringCharacterRef[];
  /** Props / objects that recur across episodes and seasons. */
  recurringObjects: RecurringObjectRef[];
}

export interface Season {
  id: string;
  /** 1-based season number. */
  number: number;
  title?: string;
  episodes: Episode[];
  /** Season-long arcs that thread through multiple episodes. */
  arcs: SeasonArc[];
}

export interface Episode {
  id: string;
  /** 1-based episode number within its season. */
  number: number;
  title: string;
  /** Optional production code (e.g. "S01E03"). */
  productionCode?: string;
}

/** Open episodes are presented as switchable tabs, similar to browser tabs. */
export interface EpisodeTab {
  episodeId: string;
  label: string;
  active: boolean;
}

/** The shared, show-level reference document. Real editing arrives later. */
export interface ShowBible {
  /** Free-form world / tone / canon notes. */
  summary: string;
}

/** A note that keeps continuity straight across episodes (placeholder). */
export interface ContinuityNote {
  id: string;
  /** Episodes this note touches, earliest first. */
  episodeIds: string[];
  note: string;
}

export interface RecurringCharacterRef {
  characterId: string;
  /** Episodes in which the character appears. */
  episodeIds: string[];
}

export interface RecurringObjectRef {
  objectId: string;
  /** Episodes in which the object appears. */
  episodeIds: string[];
}

/** An A / B / C story or season-long thread tracked across episodes. */
export interface SeasonArc {
  id: string;
  label: string;
  /** Episodes that advance this arc, in order. */
  episodeIds: string[];
}

export function aggregateEpisodes(documents: import("./screenplay.ts").ScreenplayDocument[]) {
  const characters = new Set<string>();
  const locations = new Set<string>();
  for (const document of documents) {
    document.characters?.forEach((character) => characters.add(character.canonicalName));
    document.locations?.forEach((location) => locations.add(location.canonicalName));
  }
  return { characters: [...characters].sort(), locations: [...locations].sort() };
}
