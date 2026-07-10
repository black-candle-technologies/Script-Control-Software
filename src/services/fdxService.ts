import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ScreenplayDocument } from "../domain/index.ts";

export async function chooseAndParseFdx(): Promise<ScreenplayDocument | null> {
  const selected = await open({
    multiple: false,
    title: "Open Final Draft screenplay",
    filters: [{ name: "Final Draft", extensions: ["fdx"] }],
  });
  if (!selected) return null;
  return invoke<ScreenplayDocument>("parse_fdx", { path: selected });
}

export async function saveProjectManifest(name: string, documents: ScreenplayDocument[]): Promise<string | null> {
  const path = await save({
    title: "Create SCS project wrapper",
    defaultPath: "scs.project.json",
    filters: [{ name: "SCS Project", extensions: ["json"] }],
  });
  if (!path) return null;
  await invoke("create_project_manifest", {
    path,
    name,
    projectType: documents.length > 1 ? "television" : "featureFilm",
    documents,
  });
  return path;
}

export function messageFrom(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : "The file could not be opened.";
}
