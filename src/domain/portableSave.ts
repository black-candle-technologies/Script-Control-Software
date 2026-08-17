import type { ProjectSession } from "./projectWorkspace.ts";

/**
 * Applies only the file identity returned by a completed portable write to the
 * newest live session. Content from the older save snapshot must never replace
 * edits accepted while file I/O was in flight.
 */
export function mergePortableSaveMetadata(current: ProjectSession, saved: ProjectSession): ProjectSession {
  if (current.projectId !== saved.projectId) throw new Error("Portable save metadata belongs to another project.");
  if (current.projectPath === saved.projectPath && current.updatedAt === saved.updatedAt) return current;
  return { ...current, projectPath: saved.projectPath, updatedAt: saved.updatedAt };
}
