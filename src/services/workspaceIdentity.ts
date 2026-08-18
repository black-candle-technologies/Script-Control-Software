export interface WorkspaceBootstrapIdentity {
  projectId: string;
  sessionId: string;
  windowId: string;
  slotId: string;
}

export function parseWorkspaceBootstrap(search: string): WorkspaceBootstrapIdentity | undefined {
  const params = new URLSearchParams(search);
  const projectId = params.get("scsProjectId")?.trim() ?? "";
  const sessionId = params.get("scsSessionId")?.trim() ?? "";
  const windowId = params.get("scsWindowId")?.trim() ?? "";
  const slotId = params.get("scsSlotId")?.trim() ?? "";
  return [projectId, sessionId, windowId, slotId].every(validIdentity)
    ? { projectId, sessionId, windowId, slotId }
    : undefined;
}

export function nativeWorkspaceAvailable(): boolean {
  return typeof globalThis.window !== "undefined" && "__TAURI_INTERNALS__" in globalThis.window;
}

function validIdentity(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
}
