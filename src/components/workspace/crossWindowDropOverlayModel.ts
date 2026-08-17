import type { InternalDragPayload, InternalDragPlacement } from "../../services/nativeWorkspaceService.ts";

export interface NativeDropPlacementOption {
  key: string;
  label: string;
  value: InternalDragPlacement;
}

export function nativeDropPlacementOptions(
  payload: InternalDragPayload,
  documentTabCount: number,
  dockGroupIds: readonly string[],
): NativeDropPlacementOption[] {
  if (payload.kind === "document-tab") {
    const count = Number.isSafeInteger(documentTabCount) && documentTabCount >= 0 ? documentTabCount : 0;
    return Array.from({ length: count + 1 }, (_, index) => ({
      key: `tab-${index}`,
      label: index === count ? "At end of screenplay tabs" : `Before screenplay tab ${index + 1}`,
      value: { kind: "document-tabs", index },
    }));
  }
  const groups = [...new Set(dockGroupIds.filter((groupId) => groupId.trim()).map((groupId) => groupId.trim()))];
  return [
    ...groups.flatMap((groupId) => (["center", "left", "right", "top", "bottom"] as const).map((edge) => ({
      key: `${groupId}-${edge}`,
      label: `${edge === "center" ? "Tab into" : `Dock ${edge} of`} ${groupId}`,
      value: { kind: "dock-group" as const, groupId, edge },
    }))),
    { key: "floating", label: "Float in this window", value: { kind: "floating-layer" } },
  ];
}

export function sameNativeDropPlacement(left: InternalDragPlacement, right: InternalDragPlacement): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "document-tabs") return right.kind === "document-tabs" && left.index === right.index;
  if (left.kind === "dock-group") {
    return right.kind === "dock-group" && left.groupId === right.groupId && left.edge === right.edge;
  }
  return true;
}
