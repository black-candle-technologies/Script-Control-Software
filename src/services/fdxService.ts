import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  normalizeProjectSession,
  documentsForPortableStorage,
  restoreLocalDocumentState,
  restoreLocalWorkspaceState,
  screenplayTextFingerprint,
  toFountain,
  versionHistoryForPortableStorage,
  versionsForPortableStorage,
  workspaceForPortableStorage,
  type ProjectSession,
  type ProjectWorkspace,
  type VersionHistory,
  type ScreenplayDocument,
} from "../domain/index.ts";

interface StoredProjectBundle {
  schemaVersion: number;
  id: string;
  name: string;
  projectType: "featureFilm" | "television";
  createdAt: string;
  updatedAt: string;
  documents: unknown[];
  versions: unknown[];
  versionHistory?: VersionHistory;
  workspace?: ProjectWorkspace;
}

export interface FdxFileInfo {
  path: string;
  fileName: string;
  modifiedAt: number;
  size: number;
}

export async function chooseAndParseFdx(): Promise<ScreenplayDocument | null> {
  const selected = await open({
    multiple: false,
    title: "Open Final Draft screenplay",
    filters: [{ name: "Final Draft", extensions: ["fdx"] }],
  });
  if (!selected) return null;
  return importLinkedDocument(selected);
}

export async function parseLinkedFdx(path: string): Promise<ScreenplayDocument> {
  return importLinkedDocument(path);
}

export const linkedFileModifiedAt = (path: string) => invoke<number>("file_modified_at", { path });

export async function chooseWatchFolder(defaultPath = ""): Promise<string | null> {
  const selected = await open({ multiple: false, directory: true, title: "Choose Final Draft watch folder", defaultPath: defaultPath || undefined });
  return typeof selected === "string" ? selected : null;
}

export const listFdxFiles = (folderPath: string, recursive = true) => invoke<FdxFileInfo[]>("list_fdx_files", { folderPath, recursive });
export const openFdxInExternalEditor = (path: string) => invoke<void>("open_fdx_in_external_editor", { path });
export const revealInFileManager = (path: string) => invoke<void>("reveal_in_file_manager", { path });

export async function saveFdxExport(contents: string, suggestedName: string): Promise<string | null> {
  const baseName = suggestedName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "screenplay";
  let path = await save({
    title: "Export Final Draft screenplay",
    defaultPath: `${baseName}.fdx`,
    filters: [{ name: "Final Draft", extensions: ["fdx"] }],
  });
  if (!path) return null;
  if (!path.toLowerCase().endsWith(".fdx")) path += ".fdx";
  return invoke<string>("write_fdx_export", { path, contents });
}

export async function saveProjectSession(session: ProjectSession, saveAs = false): Promise<ProjectSession | null> {
  let path = saveAs ? "" : session.projectPath;
  if (!path) {
    path = await save({
      title: "Save portable SCS project",
      defaultPath: "scs.project.json",
      filters: [{ name: "SCS Project", extensions: ["json"] }],
    }) ?? "";
  }
  if (!path) return null;
  const stored = await invoke<StoredProjectBundle>("save_project_bundle", {
    path,
    name: session.name,
    projectType: session.projectType,
    documents: documentsForPortableStorage(session.documents),
    fountainScripts: session.documents.map(toFountain),
    versions: versionsForPortableStorage(session.versions),
    versionHistory: versionHistoryForPortableStorage(session.versionHistory),
    workspace: workspaceForPortableStorage(session.workspace),
    expectedUpdatedAt: !saveAs && session.projectPath ? session.updatedAt : null,
  });
  const normalized = normalizeProjectSession({
    ...stored,
    projectId: stored.id,
    workspace: stored.workspace ?? session.workspace,
    versionHistory: stored.versionHistory ?? session.versionHistory,
    projectPath: path,
    activeDocumentId: session.activeDocumentId,
  });
  return {
    ...normalized,
    documents: restoreLocalDocumentState(normalized.documents, session.documents),
    workspace: restoreLocalWorkspaceState(normalized.workspace, session.workspace),
  };
}

export async function chooseAndOpenProject(): Promise<ProjectSession | null> {
  const selected = await open({
    multiple: false,
    title: "Open SCS project",
    filters: [{ name: "SCS Project", extensions: ["json"] }],
  });
  if (!selected) return null;
  return openProjectSession(selected);
}

export async function openProjectSession(path: string): Promise<ProjectSession> {
  const stored = await invoke<StoredProjectBundle>("open_project_bundle", { path });
  return normalizeProjectSession({
    ...stored,
    projectId: stored.id,
    workspace: stored.workspace,
    projectPath: path,
  });
}

export function messageFrom(error: unknown): string {
  return typeof error === "string" ? error.replace(/^PROJECT_CONFLICT:\s*/, "") : error instanceof Error ? error.message : "The file could not be opened.";
}

export function isProjectConflict(error: unknown): boolean {
  return typeof error === "string" && error.startsWith("PROJECT_CONFLICT:");
}

function normalizeImportedDocument(document: ScreenplayDocument): ScreenplayDocument {
  return normalizeProjectSession({
    documents: [{ ...document, readOnly: false }],
    projectType: "featureFilm",
  }).documents[0];
}

async function importLinkedDocument(path: string): Promise<ScreenplayDocument> {
  const [document, modifiedAt] = await Promise.all([
    invoke<ScreenplayDocument>("parse_fdx", { path }),
    linkedFileModifiedAt(path),
  ]);
  const normalized = normalizeImportedDocument(document);
  return normalized.source ? { ...normalized, source: { ...normalized.source, lastImportedModifiedAt: modifiedAt, lastImportedFingerprint: screenplayTextFingerprint(normalized) } } : normalized;
}
