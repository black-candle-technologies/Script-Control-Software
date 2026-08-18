import type {
  AnalysisEntities,
  CharacterProfile,
  LocationProfile,
  ObjectProfile,
  ProductionCategory,
  ProductionRow,
} from "./analysis.ts";

export type GlobalBreakdownFilterMode = "include" | "exclude";
export type GlobalBreakdownSort =
  | "appearance"
  | "lines-desc"
  | "lines-asc"
  | "scenes-desc"
  | "scenes-asc"
  | "mentions-desc"
  | "mentions-asc"
  | "name-asc"
  | "name-desc";

export interface GlobalBreakdownViewOptions {
  query: string;
  filterMode: GlobalBreakdownFilterMode;
  sort: GlobalBreakdownSort;
}

export interface GlobalBreakdownSortOption {
  value: GlobalBreakdownSort;
  label: string;
}

export const DEFAULT_GLOBAL_BREAKDOWN_VIEW_OPTIONS: GlobalBreakdownViewOptions = {
  query: "",
  filterMode: "include",
  sort: "appearance",
};

const APPEARANCE_SORT: GlobalBreakdownSortOption = { value: "appearance", label: "Order of appearance" };

export function globalBreakdownSortOptions(category: ProductionCategory): GlobalBreakdownSortOption[] {
  if (category === "cast") return [
    APPEARANCE_SORT,
    { value: "lines-desc", label: "Lines: most to least" },
    { value: "lines-asc", label: "Lines: least to most" },
    { value: "scenes-desc", label: "Scenes: most to least" },
    { value: "scenes-asc", label: "Scenes: least to most" },
  ];
  if (category === "locations") return [
    APPEARANCE_SORT,
    { value: "scenes-desc", label: "Scenes: most to least" },
    { value: "scenes-asc", label: "Scenes: least to most" },
    { value: "name-asc", label: "Name: A to Z" },
    { value: "name-desc", label: "Name: Z to A" },
  ];
  return [
    APPEARANCE_SORT,
    { value: "mentions-desc", label: "Mentions: most to least" },
    { value: "mentions-asc", label: "Mentions: least to most" },
    { value: "scenes-desc", label: "Scenes: most to least" },
    { value: "scenes-asc", label: "Scenes: least to most" },
    { value: "name-asc", label: "Name: A to Z" },
    { value: "name-desc", label: "Name: Z to A" },
  ];
}

interface RowMetrics {
  lines: number;
  scenes: number;
  mentions: number;
}

export function filterAndSortGlobalBreakdownRows(
  category: ProductionCategory,
  rows: readonly ProductionRow[],
  entities: AnalysisEntities,
  options: GlobalBreakdownViewOptions,
): ProductionRow[] {
  const tokens = searchTokens(options.query);
  const groupedMetrics = metricsByEntity(rows);
  const decorated = rows.map((row, index) => {
    const entity = entityForRow(category, row, entities);
    const fallback = groupedMetrics.get(rowIdentity(row)) ?? { lines: 0, scenes: 1, mentions: 1 };
    return {
      row,
      index,
      metrics: metricsForEntity(entity, fallback),
      searchText: rowSearchText(row, entity),
    };
  }).filter(({ searchText }) => {
    if (!tokens.length) return true;
    const matches = tokens.every((token) => searchText.includes(token));
    return options.filterMode === "exclude" ? !matches : matches;
  });

  decorated.sort((left, right) => {
    const metricDifference = sortMetric(options.sort, left.metrics, right.metrics);
    if (metricDifference !== 0) return metricDifference;
    if (options.sort === "name-asc" || options.sort === "name-desc") {
      const nameDifference = left.row.item.localeCompare(right.row.item, undefined, { sensitivity: "base" });
      if (nameDifference !== 0) return options.sort === "name-desc" ? -nameDifference : nameDifference;
    }
    const sceneDifference = left.row.sceneNumber - right.row.sceneNumber;
    if (sceneDifference !== 0) return sceneDifference;
    const itemDifference = left.row.item.localeCompare(right.row.item, undefined, { sensitivity: "base" });
    return itemDifference || left.index - right.index;
  });

  return decorated.map(({ row }) => row);
}

function sortMetric(sort: GlobalBreakdownSort, left: RowMetrics, right: RowMetrics): number {
  switch (sort) {
    case "lines-desc": return right.lines - left.lines;
    case "lines-asc": return left.lines - right.lines;
    case "scenes-desc": return right.scenes - left.scenes;
    case "scenes-asc": return left.scenes - right.scenes;
    case "mentions-desc": return right.mentions - left.mentions;
    case "mentions-asc": return left.mentions - right.mentions;
    default: return 0;
  }
}

function rowIdentity(row: ProductionRow): string {
  return row.entityId || `${row.category}:${row.item.toLocaleLowerCase()}`;
}

function metricsByEntity(rows: readonly ProductionRow[]): Map<string, RowMetrics> {
  const grouped = new Map<string, { sceneIds: Set<string>; mentions: number }>();
  for (const row of rows) {
    const key = rowIdentity(row);
    const current = grouped.get(key) ?? { sceneIds: new Set<string>(), mentions: 0 };
    current.sceneIds.add(row.sceneId);
    current.mentions += Math.max(1, row.occurrences?.length ?? 0);
    grouped.set(key, current);
  }
  return new Map([...grouped].map(([key, value]) => [key, {
    lines: 0,
    scenes: value.sceneIds.size,
    mentions: value.mentions,
  }]));
}

function entityForRow(
  category: ProductionCategory,
  row: ProductionRow,
  entities: AnalysisEntities,
): CharacterProfile | LocationProfile | ObjectProfile | undefined {
  if (category === "cast") return entities.characters.find((entity) => entity.id === row.entityId || sameName(entity.name, row.item));
  if (category === "locations") return entities.locations.find((entity) => entity.id === row.entityId || sameName(entity.name, row.item));
  return entities.objects.find((entity) => entity.id === row.entityId || sameName(entity.name, row.item));
}

function metricsForEntity(
  entity: CharacterProfile | LocationProfile | ObjectProfile | undefined,
  fallback: RowMetrics,
): RowMetrics {
  if (!entity) return fallback;
  if (entity.kind === "character") return {
    lines: entity.dialogueCount,
    scenes: entity.sceneCount,
    mentions: entity.cueCount,
  };
  if (entity.kind === "location") return {
    lines: 0,
    scenes: entity.sceneCount,
    mentions: entity.appearances.length,
  };
  return {
    lines: 0,
    scenes: entity.sceneNumbers.length,
    mentions: entity.mentions,
  };
}

function rowSearchText(
  row: ProductionRow,
  entity: CharacterProfile | LocationProfile | ObjectProfile | undefined,
): string {
  const shared = [row.item, row.evidence, row.heading, `scene ${row.sceneNumber}`];
  if (!entity) return searchable(shared);
  if (entity.kind === "character") return searchable([
    ...shared,
    entity.name,
    ...entity.aliases,
    ...entity.cueVariants,
    entity.firstDescription ?? "",
    ...entity.sceneNumbers.map((number) => `scene ${number}`),
  ]);
  if (entity.kind === "location") return searchable([
    ...shared,
    entity.name,
    ...entity.aliases,
    ...entity.interiorExterior,
    ...entity.timesOfDay,
    ...entity.sceneNumbers.map((number) => `scene ${number}`),
  ]);
  return searchable([
    ...shared,
    entity.name,
    ...entity.aliases,
    entity.category,
    entity.productionCategory,
    entity.likelyOwner ?? "",
    ...entity.associations.map((association) => association.character),
    ...entity.continuity.map((entry) => entry.excerpt),
    ...entity.sceneNumbers.map((number) => `scene ${number}`),
  ]);
}

function searchable(values: readonly string[]): string {
  return values.join(" ").normalize("NFKD").toLocaleLowerCase();
}

function searchTokens(query: string): string[] {
  return [...new Set(query.normalize("NFKD").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean))];
}

function sameName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) === 0;
}
