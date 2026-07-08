/**
 * Local persistence — localStorage for now. The service boundary the future
 * Rust/SQLite storage layer will replace; nothing else in the app touches
 * localStorage directly.
 */
import type { ScreenplayDocument } from "./domain/index.ts";

const KEY = "scs.document.v1";

export function loadDocument(): ScreenplayDocument | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as ScreenplayDocument;
    if (!Array.isArray(doc.blocks) || !doc.titlePage) return null;
    doc.sceneNotes ??= {};
    return doc;
  } catch {
    return null;
  }
}

export function saveDocument(doc: ScreenplayDocument): void {
  localStorage.setItem(KEY, JSON.stringify(doc));
}
