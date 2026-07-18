import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  normalizeProjectSession,
  toFountain,
  type ProjectSession,
  type ProjectWorkspace,
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
  workspace?: ProjectWorkspace;
}

export async function chooseAndParseFdx(): Promise<ScreenplayDocument | null> {
  const selected = await open({
    multiple: false,
    title: "Open Final Draft screenplay",
    filters: [{ name: "Final Draft", extensions: ["fdx"] }],
  });
  if (!selected) return null;
  return normalizeImportedDocument(await invoke<ScreenplayDocument>("parse_fdx", { path: selected }));
}

export async function parseLinkedFdx(path: string): Promise<ScreenplayDocument> {
  return normalizeImportedDocument(await invoke<ScreenplayDocument>("parse_fdx", { path }));
}

export const linkedFileModifiedAt = (path: string) => invoke<number>("file_modified_at", { path });

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
    documents: session.documents,
    fountainScripts: session.documents.map(toFountain),
    versions: session.versions,
    workspace: session.workspace,
    expectedUpdatedAt: !saveAs && session.projectPath ? session.updatedAt : null,
  });
  return normalizeProjectSession({
    ...stored,
    projectId: stored.id,
    workspace: stored.workspace ?? session.workspace,
    projectPath: path,
    activeDocumentId: session.activeDocumentId,
  });
}

export async function chooseAndOpenProject(): Promise<ProjectSession | null> {
  const selected = await open({
    multiple: false,
    title: "Open SCS project",
    filters: [{ name: "SCS Project", extensions: ["json"] }],
  });
  if (!selected) return null;
  const stored = await invoke<StoredProjectBundle>("open_project_bundle", { path: selected });
  return normalizeProjectSession({
    ...stored,
    projectId: stored.id,
    workspace: stored.workspace,
    projectPath: selected,
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
