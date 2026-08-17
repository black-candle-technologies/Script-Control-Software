export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  monitorId?: string;
  maximized?: boolean;
}

export interface MonitorWorkArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary?: boolean;
}

export interface ProjectWindowRecord {
  windowId: string;
  label: string;
  projectId: string;
  slotId: string;
  registrationOrder: number;
  viewRevision: number;
  isLeader: boolean;
  lastFocusedAt: number;
  geometry?: WindowGeometry;
}

export interface ProjectWindowRegistry {
  projectId: string;
  nextRegistrationOrder: number;
  windows: ProjectWindowRecord[];
}

export interface WindowCloseResult {
  registry: ProjectWindowRegistry;
  closed?: ProjectWindowRecord;
  disposition: "missing" | "secondary-closed" | "leader-promoted" | "final-window";
  promotedWindowId?: string;
}

export interface WindowMenuEntry {
  windowId: string;
  label: string;
  title: string;
  active: boolean;
  leader: boolean;
}

export const MIN_PROJECT_WINDOW_WIDTH = 980;
export const MIN_PROJECT_WINDOW_HEIGHT = 620;

export function createProjectWindowRegistry(projectId: string): ProjectWindowRegistry {
  if (!projectId.trim()) throw new Error("Project id is required for a window registry.");
  return { projectId, nextRegistrationOrder: 1, windows: [] };
}

export function registerProjectWindow(
  registry: ProjectWindowRegistry,
  input: {
    windowId?: string;
    label?: string;
    slotId?: string;
    focusedAt?: number;
    geometry?: WindowGeometry;
  } = {},
): { registry: ProjectWindowRegistry; window: ProjectWindowRecord } {
  const windowId = input.windowId?.trim() || collisionResistantWindowId();
  if (registry.windows.some((window) => window.windowId === windowId)) throw new Error("Window id is already registered.");
  const label = input.label?.trim() || createNativeWindowLabel(registry.nextRegistrationOrder);
  if (!isSafeNativeWindowLabel(label)) throw new Error("Native window label is invalid.");
  if (registry.windows.some((window) => window.label === label)) throw new Error("Native window label is already registered.");
  const slotId = input.slotId?.trim() || `slot-${registry.nextRegistrationOrder}`;
  const window: ProjectWindowRecord = {
    windowId,
    label,
    projectId: registry.projectId,
    slotId,
    registrationOrder: registry.nextRegistrationOrder,
    viewRevision: 0,
    isLeader: registry.windows.length === 0,
    lastFocusedAt: finiteNumber(input.focusedAt) ?? Date.now(),
    ...(input.geometry ? { geometry: normalizeGeometry(input.geometry) } : {}),
  };
  return {
    registry: {
      ...registry,
      nextRegistrationOrder: registry.nextRegistrationOrder + 1,
      windows: [...registry.windows, window],
    },
    window,
  };
}

export function updateProjectWindow(
  registry: ProjectWindowRegistry,
  windowId: string,
  patch: { viewRevision?: number; focusedAt?: number; geometry?: WindowGeometry },
): ProjectWindowRegistry {
  if (!registry.windows.some((window) => window.windowId === windowId)) return registry;
  return {
    ...registry,
    windows: registry.windows.map((window) => window.windowId === windowId
      ? {
          ...window,
          ...(validRevision(patch.viewRevision) && patch.viewRevision >= window.viewRevision ? { viewRevision: patch.viewRevision } : {}),
          ...(finiteNumber(patch.focusedAt) !== undefined ? { lastFocusedAt: patch.focusedAt! } : {}),
          ...(patch.geometry ? { geometry: normalizeGeometry(patch.geometry) } : {}),
        }
      : window),
  };
}

export function closeProjectWindow(registry: ProjectWindowRegistry, windowId: string): WindowCloseResult {
  const closed = registry.windows.find((window) => window.windowId === windowId);
  if (!closed) return { registry, disposition: "missing" };
  const remaining = registry.windows.filter((window) => window.windowId !== windowId);
  if (!remaining.length) {
    return { registry: { ...registry, windows: [] }, closed, disposition: "final-window" };
  }
  if (!closed.isLeader) {
    return { registry: { ...registry, windows: remaining }, closed, disposition: "secondary-closed" };
  }
  const promoted = [...remaining].sort((a, b) => a.registrationOrder - b.registrationOrder)[0];
  return {
    registry: {
      ...registry,
      windows: remaining.map((window) => ({ ...window, isLeader: window.windowId === promoted.windowId })),
    },
    closed,
    disposition: "leader-promoted",
    promotedWindowId: promoted.windowId,
  };
}

export function projectWindowMenuEntries(
  registry: ProjectWindowRegistry,
  activeWindowId: string,
  titles: Readonly<Record<string, string>> = {},
): WindowMenuEntry[] {
  return [...registry.windows]
    .sort((a, b) => a.registrationOrder - b.registrationOrder)
    .map((window, index) => ({
      windowId: window.windowId,
      label: window.label,
      title: titles[window.windowId]?.trim() || `Window ${index + 1}`,
      active: window.windowId === activeWindowId,
      leader: window.isLeader,
    }));
}

export function createNativeWindowLabel(registrationOrder = 0, nonce = crypto.randomUUID()): string {
  const safeNonce = nonce.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `scs-workspace-${Math.max(0, Math.trunc(registrationOrder))}-${safeNonce}`;
}

export function isSafeNativeWindowLabel(label: string): boolean {
  return /^scs-workspace-[a-zA-Z0-9_-]+$/.test(label) && label.length <= 96;
}

/** Restores a window visibly on an available monitor and enforces usable minimums. */
export function clampWindowGeometry(
  geometry: WindowGeometry | undefined,
  monitors: readonly MonitorWorkArea[],
): WindowGeometry {
  const usableMonitors = monitors.filter((monitor) => monitor.width > 0 && monitor.height > 0);
  const fallback: MonitorWorkArea = usableMonitors.find((monitor) => monitor.primary)
    ?? usableMonitors[0]
    ?? { id: "virtual-primary", x: 0, y: 0, width: 1440, height: 900, primary: true };
  const preferred = geometry?.monitorId
    ? usableMonitors.find((monitor) => monitor.id === geometry.monitorId) ?? fallback
    : geometry
      ? monitorWithLargestIntersection(geometry, usableMonitors) ?? fallback
      : fallback;
  const requested = normalizeGeometry(geometry ?? {
    x: preferred.x + (preferred.width - Math.min(1180, preferred.width)) / 2,
    y: preferred.y + (preferred.height - Math.min(760, preferred.height)) / 2,
    width: Math.min(1180, preferred.width),
    height: Math.min(760, preferred.height),
  });
  const minimumVisibleWidth = Math.min(MIN_PROJECT_WINDOW_WIDTH, preferred.width);
  const minimumVisibleHeight = Math.min(MIN_PROJECT_WINDOW_HEIGHT, preferred.height);
  const width = Math.min(Math.max(requested.width, minimumVisibleWidth), preferred.width);
  const height = Math.min(Math.max(requested.height, minimumVisibleHeight), preferred.height);
  const x = clamp(requested.x, preferred.x, preferred.x + preferred.width - width);
  const y = clamp(requested.y, preferred.y, preferred.y + preferred.height - height);
  return { x, y, width, height, monitorId: preferred.id, ...(requested.maximized ? { maximized: true } : {}) };
}

function monitorWithLargestIntersection(
  geometry: WindowGeometry,
  monitors: readonly MonitorWorkArea[],
): MonitorWorkArea | undefined {
  return [...monitors].sort((a, b) => intersectionArea(geometry, b) - intersectionArea(geometry, a))[0];
}

function intersectionArea(a: WindowGeometry, b: MonitorWorkArea): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function normalizeGeometry(value: WindowGeometry): WindowGeometry {
  return {
    x: finiteNumber(value.x) ?? 0,
    y: finiteNumber(value.y) ?? 0,
    width: Math.max(1, finiteNumber(value.width) ?? MIN_PROJECT_WINDOW_WIDTH),
    height: Math.max(1, finiteNumber(value.height) ?? MIN_PROJECT_WINDOW_HEIGHT),
    ...(value.monitorId?.trim() ? { monitorId: value.monitorId.trim() } : {}),
    ...(value.maximized === true ? { maximized: true } : {}),
  };
}

function collisionResistantWindowId(): string {
  return `window-${crypto.randomUUID()}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
