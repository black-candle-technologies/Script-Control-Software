import type { ReactNode } from "react";
import type {
  SynchronizedPanelState,
  WorkspacePanelDefinition,
  WorkspacePanelKind,
} from "../../domain/workspaceLayouts.ts";

export interface WorkspacePanelContext {
  renderers: Partial<Record<WorkspacePanelKind, (definition: WorkspacePanelDefinition) => ReactNode>>;
  fallback?: (definition: WorkspacePanelDefinition) => ReactNode;
}

export interface PanelRegistration {
  title: string;
  minimumSize: number;
  copyable: boolean;
  synchronizationModes: SynchronizedPanelState["mode"][];
  render: (definition: WorkspacePanelDefinition, context: WorkspacePanelContext) => ReactNode;
}

function registration(
  kind: WorkspacePanelKind,
  title: string,
  minimumSize: number,
  copyable: boolean,
  synchronizationModes: SynchronizedPanelState["mode"][],
): PanelRegistration {
  return {
    title,
    minimumSize,
    copyable,
    synchronizationModes,
    render(definition, context) {
      const renderer = context.renderers[kind];
      return renderer?.(definition)
        ?? context.fallback?.(definition)
        ?? <p className="workspace-panel-unavailable">{definition.title} is unavailable in this window.</p>;
    },
  };
}

/** Exhaustive registry: adding a panel kind fails type-checking until it is registered. */
export const WORKSPACE_PANEL_REGISTRY = {
  navigator: registration("navigator", "Navigator", 180, false, ["active-scene", "selection"]),
  screenplay: registration("screenplay", "Screenplay", 420, false, ["active-scene", "selection", "scroll"]),
  inspector: registration("inspector", "Inspector", 260, false, ["active-scene", "selection"]),
  reference: registration("reference", "Reference", 260, true, ["active-scene", "selection", "scroll"]),
  story: registration("story", "Story", 300, true, ["active-scene", "selection"]),
  treatment: registration("treatment", "Treatment", 300, true, ["active-scene", "selection", "scroll"]),
  breakdown: registration("breakdown", "Breakdown", 300, true, ["active-scene", "selection"]),
  versions: registration("versions", "Versions", 300, true, ["selection"]),
  series: registration("series", "Series", 300, true, ["active-scene", "selection"]),
  production: registration("production", "Production", 320, true, ["active-scene", "selection"]),
  companion: registration("companion", "Companion", 420, false, ["active-scene", "selection"]),
} satisfies Record<WorkspacePanelKind, PanelRegistration>;

export function renderRegisteredPanel(
  definition: WorkspacePanelDefinition,
  context: WorkspacePanelContext,
): ReactNode {
  return WORKSPACE_PANEL_REGISTRY[definition.kind].render(definition, context);
}
