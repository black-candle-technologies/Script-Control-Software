import type { ProductionCategory } from "./analysis.ts";

export const UI_PREFERENCES_KEY = "scs.ui.v2";
export const LEGACY_UI_PREFERENCES_KEY = "scs.ui.v1";
export const UI_PREFERENCES_SCHEMA_VERSION = 2 as const;

export const DEFAULT_UI_CHROME_PREFERENCES = {
  navOpen: true,
  inspOpen: true,
  navWidth: 264,
  inspWidth: 320,
  zoom: 1,
} as const;

export interface UiChromePreferences {
  navOpen: boolean;
  inspOpen: boolean;
  navWidth: number;
  inspWidth: number;
  zoom: number;
}

export const DEFAULT_BREAKDOWN_SECTION_STATE = {
  overview: true,
  "plot-threads": true,
  "structure-coverage": true,
  "treatment-coverage": false,
  "unresolved-beats": true,
  "character-arcs": false,
  "pacing-checks": true,
  "detailed-scenes": false,
  export: false,
} as const;

export type BreakdownSectionId = keyof typeof DEFAULT_BREAKDOWN_SECTION_STATE;
export type BreakdownSectionState = Record<BreakdownSectionId, boolean>;

export const DEFAULT_GLOBAL_BREAKDOWN_CATEGORY_STATE = {
  cast: true,
  locations: true,
  props: true,
  vehicles: true,
  animals: true,
  weapons: true,
  stunts: true,
  vfx: true,
  sfx: true,
  wardrobe: true,
  makeup: true,
  nightScenes: true,
  crowdScenes: true,
  highComplexityScenes: true,
} as const satisfies Record<ProductionCategory, boolean>;

export type GlobalBreakdownCategoryState = Record<ProductionCategory, boolean>;

interface BreakdownScopePreferences {
  sections: Partial<BreakdownSectionState>;
  globalCategories?: Partial<GlobalBreakdownCategoryState>;
}

export interface UiPreferences {
  schemaVersion: typeof UI_PREFERENCES_SCHEMA_VERSION;
  chrome: UiChromePreferences;
  breakdownScopes: Record<string, BreakdownScopePreferences>;
  /** Machine-local project/window state. Logical saved layouts remain portable. */
  projects: Record<string, UiProjectPreferences>;
}

export interface UiProjectPreferences {
  windows: Record<string, UiWindowPreferences>;
}

export interface UiWindowGeometryPreferences {
  x: number;
  y: number;
  width: number;
  height: number;
  monitorId?: string;
  maximized?: boolean;
}

export interface StoredDocumentTabPreferences {
  openDocumentIds: string[];
  activeDocumentId?: string;
  recentlyClosedDocumentIds: string[];
  views: Record<string, StoredDocumentViewPreferences>;
}

export interface StoredDocumentViewPreferences {
  activeBlockId?: string;
  sourceMode: boolean;
  sourceSelection?: { start: number; end: number };
  editorScrollTop: number;
}

export interface UiWindowPreferences {
  slotId: string;
  geometry?: UiWindowGeometryPreferences;
  tabs: StoredDocumentTabPreferences;
  activeLayoutId: string;
  activeMode: string;
  activePanelId?: string;
  selectedSceneByDocument: Record<string, string>;
  selectedBeatByDocument: Record<string, string>;
  collapsedStoryNodesByDocument: Record<string, string[]>;
}

export interface UiPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const sectionIds = Object.keys(DEFAULT_BREAKDOWN_SECTION_STATE) as BreakdownSectionId[];
const globalCategoryIds = Object.keys(DEFAULT_GLOBAL_BREAKDOWN_CATEGORY_STATE) as ProductionCategory[];
const zoomLevels = new Set([0.85, 1, 1.15, 1.3]);

export function defaultUiPreferences(): UiPreferences {
  return {
    schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
    chrome: { ...DEFAULT_UI_CHROME_PREFERENCES },
    breakdownScopes: {},
    projects: {},
  };
}

export function uiPreferenceScope(projectId: string, documentId: string): string {
  return `${encodeURIComponent(projectId.trim() || "project")}/${encodeURIComponent(documentId.trim() || "document")}`;
}

export function normalizeUiPreferences(value: unknown): UiPreferences {
  if (!isRecord(value)) return defaultUiPreferences();

  // `scs.ui.v1` was an unversioned flat object. Accepting it here makes
  // migration testable without coupling the domain normalizer to localStorage.
  if (isLegacyChrome(value)) {
    return {
      ...defaultUiPreferences(),
      chrome: normalizeChrome(value),
    };
  }

  if (value.schemaVersion !== UI_PREFERENCES_SCHEMA_VERSION) return defaultUiPreferences();
  const breakdownScopes: UiPreferences["breakdownScopes"] = {};
  if (isRecord(value.breakdownScopes)) {
    for (const [scope, rawScope] of Object.entries(value.breakdownScopes)) {
      if (!scope || scope.length > 1024 || !isRecord(rawScope) || !isRecord(rawScope.sections)) continue;
      const sections: Partial<BreakdownSectionState> = {};
      for (const id of sectionIds) {
        if (typeof rawScope.sections[id] === "boolean") sections[id] = rawScope.sections[id];
      }
      const globalCategories: Partial<GlobalBreakdownCategoryState> = {};
      if (isRecord(rawScope.globalCategories)) {
        for (const id of globalCategoryIds) {
          if (typeof rawScope.globalCategories[id] === "boolean") globalCategories[id] = rawScope.globalCategories[id];
        }
      }
      breakdownScopes[scope] = {
        sections,
        ...(Object.keys(globalCategories).length ? { globalCategories } : {}),
      };
    }
  }
  const projects: UiPreferences["projects"] = {};
  if (isRecord(value.projects)) {
    for (const [projectId, rawProject] of Object.entries(value.projects)) {
      if (!safeScopeId(projectId) || !isRecord(rawProject) || !isRecord(rawProject.windows)) continue;
      const windows: Record<string, UiWindowPreferences> = {};
      for (const [slotId, rawWindow] of Object.entries(rawProject.windows)) {
        if (safeScopeId(slotId)) windows[slotId] = normalizeUiWindowPreferences(rawWindow, slotId);
      }
      projects[projectId] = { windows };
    }
  }
  return {
    schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
    chrome: normalizeChrome(value.chrome),
    breakdownScopes,
    projects,
  };
}

export function loadUiPreferences(storage: UiPreferenceStorage): UiPreferences {
  const current = readJson(storage, UI_PREFERENCES_KEY);
  if (isRecord(current) && current.schemaVersion === UI_PREFERENCES_SCHEMA_VERSION) {
    return normalizeUiPreferences(current);
  }
  return normalizeUiPreferences(readJson(storage, LEGACY_UI_PREFERENCES_KEY));
}

export function saveUiPreferences(storage: UiPreferenceStorage, preferences: UiPreferences): boolean {
  return writeUiPreferences(storage, preferences);
}

/**
 * Persists one window's local view without allowing a stale React snapshot to
 * replace sibling window slots written by another webview.
 */
export function saveUiPreferencesForWindow(
  storage: UiPreferenceStorage,
  preferences: UiPreferences,
  projectId: string,
  slotId: string,
): boolean {
  try {
    const candidate = normalizeUiPreferences(preferences);
    const latest = loadUiPreferences(storage);
    const merged = withUiWindowPreferences({
      ...latest,
      chrome: candidate.chrome,
      breakdownScopes: candidate.breakdownScopes,
    }, projectId, slotId, uiWindowPreferences(candidate, projectId, slotId));
    return writeUiPreferences(storage, merged);
  } catch {
    return false;
  }
}

/** Returns whether a storage event actually changed the requested window slot. */
export function storedUiWindowPreferencesChanged(
  previousSerialized: string | null,
  nextSerialized: string | null,
  projectId: string,
  slotId: string,
): boolean {
  const previous = uiWindowPreferences(parseSerializedUiPreferences(previousSerialized), projectId, slotId);
  const next = uiWindowPreferences(parseSerializedUiPreferences(nextSerialized), projectId, slotId);
  return JSON.stringify(previous) !== JSON.stringify(next);
}

export function breakdownSectionsForScope(preferences: UiPreferences, scope: string): BreakdownSectionState {
  return {
    ...DEFAULT_BREAKDOWN_SECTION_STATE,
    ...(preferences.breakdownScopes[scope]?.sections ?? {}),
  };
}

export function globalBreakdownCategoriesForScope(preferences: UiPreferences, scope: string): GlobalBreakdownCategoryState {
  return {
    ...DEFAULT_GLOBAL_BREAKDOWN_CATEGORY_STATE,
    ...(preferences.breakdownScopes[scope]?.globalCategories ?? {}),
  };
}

export function withBreakdownSections(
  preferences: UiPreferences,
  scope: string,
  sections: BreakdownSectionState,
): UiPreferences {
  const normalized = Object.fromEntries(sectionIds.map((id) => [id, Boolean(sections[id])])) as BreakdownSectionState;
  return {
    ...preferences,
    breakdownScopes: {
      ...preferences.breakdownScopes,
      [scope]: {
        sections: normalized,
        ...(preferences.breakdownScopes[scope]?.globalCategories
          ? { globalCategories: preferences.breakdownScopes[scope].globalCategories }
          : {}),
      },
    },
  };
}

export function withGlobalBreakdownCategories(
  preferences: UiPreferences,
  scope: string,
  globalCategories: GlobalBreakdownCategoryState,
): UiPreferences {
  const normalized = Object.fromEntries(globalCategoryIds.map((id) => [id, Boolean(globalCategories[id])])) as GlobalBreakdownCategoryState;
  return {
    ...preferences,
    breakdownScopes: {
      ...preferences.breakdownScopes,
      [scope]: {
        sections: preferences.breakdownScopes[scope]?.sections ?? {},
        globalCategories: normalized,
      },
    },
  };
}

export function resetBreakdownSections(preferences: UiPreferences, scope: string): UiPreferences {
  const current = preferences.breakdownScopes[scope];
  if (!current) return preferences;
  const breakdownScopes = { ...preferences.breakdownScopes };
  if (current.globalCategories) breakdownScopes[scope] = { sections: {}, globalCategories: current.globalCategories };
  else delete breakdownScopes[scope];
  return { ...preferences, breakdownScopes };
}

export function defaultUiWindowPreferences(slotId = "primary"): UiWindowPreferences {
  return {
    slotId: preferenceIdentity(slotId, "primary"),
    tabs: { openDocumentIds: [], recentlyClosedDocumentIds: [], views: {} },
    activeLayoutId: "writer",
    activeMode: "write",
    selectedSceneByDocument: {},
    selectedBeatByDocument: {},
    collapsedStoryNodesByDocument: {},
  };
}

export function uiWindowPreferences(preferences: UiPreferences, projectId: string, slotId: string): UiWindowPreferences {
  const projectKey = preferenceIdentity(projectId, "project");
  const slotKey = preferenceIdentity(slotId, "primary");
  return preferences.projects[projectKey]?.windows[slotKey] ?? defaultUiWindowPreferences(slotKey);
}

export function withUiWindowPreferences(
  preferences: UiPreferences,
  projectId: string,
  slotId: string,
  patch: Partial<Omit<UiWindowPreferences, "slotId">>,
): UiPreferences {
  const projectKey = preferenceIdentity(projectId, "project");
  const slotKey = preferenceIdentity(slotId, "primary");
  const next = normalizeUiWindowPreferences({ ...uiWindowPreferences(preferences, projectKey, slotKey), ...patch }, slotKey);
  return {
    ...preferences,
    projects: {
      ...preferences.projects,
      [projectKey]: { windows: { ...(preferences.projects[projectKey]?.windows ?? {}), [slotKey]: next } },
    },
  };
}

export function removeUiWindowPreferences(preferences: UiPreferences, projectId: string, slotId: string): UiPreferences {
  const projectKey = preferenceIdentity(projectId, "project");
  const slotKey = preferenceIdentity(slotId, "primary");
  const project = preferences.projects[projectKey];
  if (!project?.windows[slotKey]) return preferences;
  const windows = { ...project.windows };
  delete windows[slotKey];
  const projects = { ...preferences.projects };
  if (Object.keys(windows).length) projects[projectKey] = { windows };
  else delete projects[projectKey];
  return { ...preferences, projects };
}

function normalizeChrome(value: unknown): UiChromePreferences {
  const record = isRecord(value) ? value : {};
  return {
    navOpen: typeof record.navOpen === "boolean" ? record.navOpen : DEFAULT_UI_CHROME_PREFERENCES.navOpen,
    inspOpen: typeof record.inspOpen === "boolean" ? record.inspOpen : DEFAULT_UI_CHROME_PREFERENCES.inspOpen,
    navWidth: boundedNumber(record.navWidth, 200, 460, DEFAULT_UI_CHROME_PREFERENCES.navWidth),
    inspWidth: boundedNumber(record.inspWidth, 240, 560, DEFAULT_UI_CHROME_PREFERENCES.inspWidth),
    zoom: typeof record.zoom === "number" && zoomLevels.has(record.zoom) ? record.zoom : DEFAULT_UI_CHROME_PREFERENCES.zoom,
  };
}

function normalizeUiWindowPreferences(value: unknown, slotId: string): UiWindowPreferences {
  const record = isRecord(value) ? value : {};
  const tabs = isRecord(record.tabs) ? record.tabs : {};
  const geometry = normalizeUiGeometry(record.geometry);
  return {
    slotId,
    ...(geometry ? { geometry } : {}),
    tabs: {
      openDocumentIds: safeIdArray(tabs.openDocumentIds),
      ...(safeIdentity(tabs.activeDocumentId) ? { activeDocumentId: safeIdentity(tabs.activeDocumentId) } : {}),
      recentlyClosedDocumentIds: safeIdArray(tabs.recentlyClosedDocumentIds).slice(0, 20),
      views: normalizeStoredDocumentViews(tabs.views),
    },
    activeLayoutId: safeIdentity(record.activeLayoutId) || "writer",
    activeMode: safeIdentity(record.activeMode) || "write",
    ...(safeIdentity(record.activePanelId) ? { activePanelId: safeIdentity(record.activePanelId) } : {}),
    selectedSceneByDocument: safeStringRecord(record.selectedSceneByDocument),
    selectedBeatByDocument: safeStringRecord(record.selectedBeatByDocument),
    collapsedStoryNodesByDocument: safeStringArrayRecord(record.collapsedStoryNodesByDocument),
  };
}

function normalizeUiGeometry(value: unknown): UiWindowGeometryPreferences | undefined {
  if (!isRecord(value) || ![value.x, value.y, value.width, value.height].every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
  return {
    x: value.x as number,
    y: value.y as number,
    width: Math.max(320, Math.min(10000, value.width as number)),
    height: Math.max(240, Math.min(10000, value.height as number)),
    ...(safeIdentity(value.monitorId) ? { monitorId: safeIdentity(value.monitorId) } : {}),
    ...(value.maximized === true ? { maximized: true } : {}),
  };
}

function normalizeStoredDocumentViews(value: unknown): Record<string, StoredDocumentViewPreferences> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([documentId, raw]) => {
    if (!safeScopeId(documentId) || !isRecord(raw)) return [];
    const start = finiteNonNegative(raw.sourceSelection && isRecord(raw.sourceSelection) ? raw.sourceSelection.start : undefined);
    const end = finiteNonNegative(raw.sourceSelection && isRecord(raw.sourceSelection) ? raw.sourceSelection.end : undefined);
    return [[documentId, {
      ...(safeIdentity(raw.activeBlockId) ? { activeBlockId: safeIdentity(raw.activeBlockId) } : {}),
      sourceMode: raw.sourceMode === true,
      ...(start !== undefined && end !== undefined ? { sourceSelection: { start, end: Math.max(start, end) } } : {}),
      editorScrollTop: finiteNonNegative(raw.editorScrollTop) ?? 0,
    }] as const];
  }));
}

function safeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => safeScopeId(key) && safeIdentity(item) ? [[key, safeIdentity(item)] as const] : []));
}

function safeStringArrayRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => safeScopeId(key) ? [[key, safeIdArray(item)] as const] : []));
}

function safeIdArray(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.flatMap((item) => safeIdentity(item) ? [safeIdentity(item)] : []))] : [];
}

function safeIdentity(value: unknown): string {
  return typeof value === "string" && value.trim().length <= 512 ? value.trim() : "";
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function safeScopeId(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 1024;
}

function preferenceIdentity(value: string, fallback: string): string {
  return safeIdentity(value) || fallback;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function isLegacyChrome(value: Record<string, unknown>): boolean {
  return ["navOpen", "inspOpen", "navWidth", "inspWidth", "zoom"].some((key) => key in value);
}

function readJson(storage: UiPreferenceStorage, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value === null ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseSerializedUiPreferences(serialized: string | null): UiPreferences {
  if (serialized === null) return defaultUiPreferences();
  try {
    return normalizeUiPreferences(JSON.parse(serialized));
  } catch {
    return defaultUiPreferences();
  }
}

function writeUiPreferences(storage: UiPreferenceStorage, preferences: UiPreferences): boolean {
  try {
    const serialized = JSON.stringify(normalizeUiPreferences(preferences));
    if (storage.getItem(UI_PREFERENCES_KEY) !== serialized) storage.setItem(UI_PREFERENCES_KEY, serialized);
    storage.removeItem(LEGACY_UI_PREFERENCES_KEY);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
