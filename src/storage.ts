/** Emergency local recovery. Portable project folders remain the durable source. */
import {
  createProjectSession,
  normalizeProjectSession,
  type DraftSnapshot,
  type ProjectSession,
  type ScreenplayDocument,
} from "./domain/index.ts";

const LEGACY_DOCUMENT_KEY = "scs.document.v1";
const LEGACY_VERSIONS_KEY = "scs.versions.v1";
const SESSION_KEY = "scs.project-session.v3";

export function loadSession(): ProjectSession | null {
  try {
    const current = localStorage.getItem(SESSION_KEY);
    if (current) return normalizeProjectSession(JSON.parse(current));
    const document = localStorage.getItem(LEGACY_DOCUMENT_KEY);
    if (!document) return null;
    return normalizeProjectSession({
      documents: [JSON.parse(document)],
      versions: JSON.parse(localStorage.getItem(LEGACY_VERSIONS_KEY) ?? "[]"),
    });
  } catch {
    return null;
  }
}

export function saveSession(session: ProjectSession): boolean {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem(LEGACY_DOCUMENT_KEY);
    localStorage.removeItem(LEGACY_VERSIONS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_DOCUMENT_KEY);
  localStorage.removeItem(LEGACY_VERSIONS_KEY);
}

/** Compatibility helpers retained while callers move to whole-project sessions. */
export function loadDocument(): ScreenplayDocument | null {
  return loadSession()?.documents[0] ?? null;
}

export function saveDocument(doc: ScreenplayDocument): void {
  const session = loadSession() ?? createProjectSession(doc);
  session.documents[0] = doc;
  saveSession(session);
}

export function loadVersions(): DraftSnapshot[] {
  return loadSession()?.versions ?? [];
}

export function saveVersions(versions: DraftSnapshot[]): void {
  const session = loadSession();
  if (!session) return;
  session.versions = versions;
  saveSession(session);
}
