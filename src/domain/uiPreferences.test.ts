import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BREAKDOWN_SECTION_STATE,
  LEGACY_UI_PREFERENCES_KEY,
  UI_PREFERENCES_KEY,
  breakdownSectionsForScope,
  defaultUiPreferences,
  defaultUiWindowPreferences,
  loadUiPreferences,
  normalizeUiPreferences,
  resetBreakdownSections,
  removeUiWindowPreferences,
  saveUiPreferences,
  saveUiPreferencesForWindow,
  storedUiWindowPreferencesChanged,
  uiPreferenceScope,
  uiWindowPreferences,
  withBreakdownSections,
  withUiWindowPreferences,
  type UiPreferenceStorage,
} from "./uiPreferences.ts";

class MemoryStorage implements UiPreferenceStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("UI preferences migrate legacy chrome values and normalize hostile fields", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_UI_PREFERENCES_KEY, JSON.stringify({
    navOpen: false,
    inspOpen: "yes",
    navWidth: 9999,
    inspWidth: 100,
    zoom: 7,
  }));

  const preferences = loadUiPreferences(storage);
  assert.deepEqual(preferences.chrome, {
    navOpen: false,
    inspOpen: true,
    navWidth: 460,
    inspWidth: 240,
    zoom: 1,
  });
  assert.equal(saveUiPreferences(storage, preferences), true);
  assert.equal(storage.getItem(LEGACY_UI_PREFERENCES_KEY), null);
  assert.equal(JSON.parse(storage.getItem(UI_PREFERENCES_KEY)!).schemaVersion, 2);
});

test("breakdown disclosure state is scoped by project and document and resets to defaults", () => {
  const first = uiPreferenceScope("project/a", "document one");
  const second = uiPreferenceScope("project/a", "document two");
  assert.notEqual(first, second);

  let preferences = defaultUiPreferences();
  preferences = withBreakdownSections(preferences, first, {
    ...DEFAULT_BREAKDOWN_SECTION_STATE,
    "treatment-coverage": true,
    overview: false,
  });
  assert.equal(breakdownSectionsForScope(preferences, first)["treatment-coverage"], true);
  assert.equal(breakdownSectionsForScope(preferences, first).overview, false);
  assert.deepEqual(breakdownSectionsForScope(preferences, second), DEFAULT_BREAKDOWN_SECTION_STATE);

  preferences = resetBreakdownSections(preferences, first);
  assert.deepEqual(breakdownSectionsForScope(preferences, first), DEFAULT_BREAKDOWN_SECTION_STATE);
});

test("normalization drops unknown sections and malformed scopes", () => {
  const normalized = normalizeUiPreferences({
    schemaVersion: 2,
    chrome: { navOpen: true, inspOpen: false, navWidth: 300, inspWidth: 400, zoom: 1.15 },
    breakdownScopes: {
      good: { sections: { overview: false, unknown: true, "detailed-scenes": "open" } },
      bad: "sections",
    },
  });
  assert.deepEqual(normalized.breakdownScopes, { good: { sections: { overview: false } } });
  assert.equal(breakdownSectionsForScope(normalized, "good")["detailed-scenes"], false);
});

test("window preferences are project/slot scoped, normalized, and removable", () => {
  let preferences = defaultUiPreferences();
  preferences = withUiWindowPreferences(preferences, "project-a", "secondary", {
    geometry: { x: 4000, y: -50, width: 40, height: 99999, monitorId: "display" },
    tabs: { openDocumentIds: ["one", "one", "two"], activeDocumentId: "two", recentlyClosedDocumentIds: ["three"], views: { one: { sourceMode: true, editorScrollTop: 42 } } },
    activeLayoutId: "development",
    activeMode: "outline",
    selectedSceneByDocument: { one: "scene-one" },
    selectedBeatByDocument: { one: "beat-one" },
    collapsedStoryNodesByDocument: { one: ["act:one", "act:one"] },
  });
  const window = uiWindowPreferences(preferences, "project-a", "secondary");
  assert.deepEqual(window.geometry, { x: 4000, y: -50, width: 320, height: 10000, monitorId: "display" });
  assert.deepEqual(window.tabs.openDocumentIds, ["one", "two"]);
  assert.deepEqual(window.collapsedStoryNodesByDocument.one, ["act:one"]);
  assert.deepEqual(uiWindowPreferences(preferences, "project-b", "secondary"), defaultUiWindowPreferences("secondary"));
  preferences = removeUiWindowPreferences(preferences, "project-a", "secondary");
  assert.equal(preferences.projects["project-a"], undefined);
});

test("window-scoped persistence merges concurrent stale slot snapshots without losing either window", () => {
  const storage = new MemoryStorage();
  let initial = defaultUiPreferences();
  initial = withUiWindowPreferences(initial, "project-a", "source", {
    tabs: { openDocumentIds: ["one", "two"], activeDocumentId: "two", recentlyClosedDocumentIds: [], views: {} },
  });
  initial = withUiWindowPreferences(initial, "project-a", "destination", {
    tabs: { openDocumentIds: ["one"], activeDocumentId: "one", recentlyClosedDocumentIds: [], views: {} },
  });
  assert.equal(saveUiPreferences(storage, initial), true);

  // Both webviews derive their ACK result from the same pre-transfer snapshot.
  const staleSource = withUiWindowPreferences(initial, "project-a", "source", {
    tabs: { openDocumentIds: ["one"], activeDocumentId: "one", recentlyClosedDocumentIds: ["two"], views: {} },
  });
  const staleDestination = withUiWindowPreferences(initial, "project-a", "destination", {
    tabs: { openDocumentIds: ["one", "two"], activeDocumentId: "two", recentlyClosedDocumentIds: [], views: {} },
  });

  assert.equal(saveUiPreferencesForWindow(storage, staleDestination, "project-a", "destination"), true);
  assert.equal(saveUiPreferencesForWindow(storage, staleSource, "project-a", "source"), true);

  const saved = loadUiPreferences(storage);
  assert.deepEqual(uiWindowPreferences(saved, "project-a", "source").tabs.openDocumentIds, ["one"]);
  assert.deepEqual(uiWindowPreferences(saved, "project-a", "destination").tabs.openDocumentIds, ["one", "two"]);
});

test("a sibling-slot storage write is not reported as a change to the current window", () => {
  let previous = defaultUiPreferences();
  previous = withUiWindowPreferences(previous, "project-a", "destination", {
    tabs: { openDocumentIds: ["one", "two"], activeDocumentId: "two", recentlyClosedDocumentIds: [], views: {} },
  });
  const next = withUiWindowPreferences(previous, "project-a", "source", {
    tabs: { openDocumentIds: ["one"], activeDocumentId: "one", recentlyClosedDocumentIds: ["two"], views: {} },
  });

  const before = JSON.stringify(previous);
  const after = JSON.stringify(next);
  assert.equal(storedUiWindowPreferencesChanged(before, after, "project-a", "destination"), false);
  assert.equal(storedUiWindowPreferencesChanged(before, after, "project-a", "source"), true);
});

test("hostile project/window preference records are discarded without losing valid chrome", () => {
  const normalized = normalizeUiPreferences({
    schemaVersion: 2,
    chrome: { navOpen: false },
    breakdownScopes: {},
    projects: {
      project: { windows: { primary: { geometry: { x: "bad" }, tabs: { openDocumentIds: [null, "doc"] }, selectedSceneByDocument: { doc: 4 } } } },
      "": { windows: {} },
    },
  });
  assert.equal(normalized.chrome.navOpen, false);
  assert.equal(normalized.projects.project.windows.primary.geometry, undefined);
  assert.deepEqual(normalized.projects.project.windows.primary.tabs.openDocumentIds, ["doc"]);
  assert.deepEqual(normalized.projects.project.windows.primary.selectedSceneByDocument, {});
});
