import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toFountain, type DraftSnapshot, type ScreenplayDocument } from "../domain/index.ts";

export interface ProjectBundle {
  schemaVersion: number;
  name: string;
  projectType: "featureFilm" | "television";
  documents: ScreenplayDocument[];
  versions: DraftSnapshot[];
}

export async function chooseAndParseFdx(): Promise<ScreenplayDocument | null> {
  const selected = await open({
    multiple: false,
    title: "Open Final Draft screenplay",
    filters: [{ name: "Final Draft", extensions: ["fdx"] }],
  });
  if (!selected) return null;
  const document = await invoke<ScreenplayDocument>("parse_fdx", { path: selected });
  return { ...document, readOnly: false, workspace: document.workspace ?? {
    treatment: "", showBible: "", continuity: "", seasonArc: "", productionNotes: "", comments: [], entityStatuses: {},
  } };
}

export async function parseLinkedFdx(path: string): Promise<ScreenplayDocument> {
  const document = await invoke<ScreenplayDocument>("parse_fdx", { path });
  return { ...document, readOnly: false };
}

export const linkedFileModifiedAt = (path: string) => invoke<number>("file_modified_at", { path });

export async function saveProjectBundle(name: string, documents: ScreenplayDocument[], versions: DraftSnapshot[]): Promise<string | null> {
  const path = await save({
    title: "Create SCS project wrapper",
    defaultPath: "scs.project.json",
    filters: [{ name: "SCS Project", extensions: ["json"] }],
  });
  if (!path) return null;
  await invoke("save_project_bundle", {
    path,
    name,
    projectType: documents.length > 1 ? "television" : "featureFilm",
    documents,
    fountainScripts: documents.map(toFountain),
    versions,
  });
  return path;
}

export async function chooseAndOpenProject(): Promise<ProjectBundle | null> {
  const selected = await open({ multiple: false, title: "Open SCS project", filters: [{ name: "SCS Project", extensions: ["json"] }] });
  if (!selected) return null;
  return invoke<ProjectBundle>("open_project_bundle", { path: selected });
}

export function messageFrom(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : "The file could not be opened.";
}
