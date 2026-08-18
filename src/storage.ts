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
const LEGACY_SESSION_KEY = "scs.project-session.v3";
const SESSION_KEY_PREFIX = "scs.project-session.v4:";
const CURRENT_PROJECT_KEY = "scs.project-session.v4.current-project";

function sessionKey(projectId: string): string {
  return `${SESSION_KEY_PREFIX}${encodeURIComponent(projectId)}`;
}

function parseSession(value: string | null): ProjectSession | null {
  if (!value) return null;
  try {
    return normalizeProjectSession(JSON.parse(value));
  } catch {
    return null;
  }
}

/** Load a project-scoped recovery snapshot, or the most recently saved project. */
export function loadSession(projectId?: string): ProjectSession | null {
  try {
    const selectedProjectId = projectId || localStorage.getItem(CURRENT_PROJECT_KEY) || "";
    if (selectedProjectId) {
      const scoped = parseSession(localStorage.getItem(sessionKey(selectedProjectId)));
      if (scoped && (!projectId || scoped.projectId === projectId)) return scoped;
    }

    // One-way compatibility migration from the former global recovery slot.
    const legacySession = parseSession(localStorage.getItem(LEGACY_SESSION_KEY));
    if (legacySession && (!projectId || legacySession.projectId === projectId)) {
      saveSession(legacySession);
      return legacySession;
    }

    const document = localStorage.getItem(LEGACY_DOCUMENT_KEY);
    if (!document) return null;
    const migrated = normalizeProjectSession({
      documents: [JSON.parse(document)],
      versions: JSON.parse(localStorage.getItem(LEGACY_VERSIONS_KEY) ?? "[]"),
    });
    if (projectId && migrated.projectId !== projectId) return null;
    saveSession(migrated);
    return migrated;
  } catch {
    return null;
  }
}

export function saveSession(session: ProjectSession): boolean {
  try {
    localStorage.setItem(sessionKey(session.projectId), JSON.stringify(session));
    localStorage.setItem(CURRENT_PROJECT_KEY, session.projectId);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_DOCUMENT_KEY);
    localStorage.removeItem(LEGACY_VERSIONS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearSession(projectId?: string): void {
  const selectedProjectId = projectId || localStorage.getItem(CURRENT_PROJECT_KEY) || "";
  if (selectedProjectId) localStorage.removeItem(sessionKey(selectedProjectId));
  if (!projectId || localStorage.getItem(CURRENT_PROJECT_KEY) === projectId) {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  }
  localStorage.removeItem(LEGACY_SESSION_KEY);
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
