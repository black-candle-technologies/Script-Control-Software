/**
 * Local persistence — localStorage for now. The service boundary the future
 * Rust/SQLite storage layer will replace; nothing else in the app touches
 * localStorage directly.
 */
import type { DraftSnapshot, ScreenplayDocument } from "./domain/index.ts";

const KEY = "scs.document.v1";
const VERSIONS_KEY = "scs.versions.v1";

export function loadDocument(): ScreenplayDocument | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as ScreenplayDocument;
    if (!Array.isArray(doc.blocks) || !doc.titlePage) return null;
    doc.sceneNotes ??= {};
    doc.workspace ??= { treatment: "", showBible: "", continuity: "", seasonArc: "", productionNotes: "", comments: [], entityStatuses: {} };
    return doc;
  } catch {
    return null;
  }
}

export function saveDocument(doc: ScreenplayDocument): void {
  localStorage.setItem(KEY, JSON.stringify(doc));
}

export function loadVersions(): DraftSnapshot[] {
  try {
    const versions = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? "[]") as DraftSnapshot[];
    return Array.isArray(versions) ? versions : [];
  } catch {
    return [];
  }
}

export function saveVersions(versions: DraftSnapshot[]): void {
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
}
