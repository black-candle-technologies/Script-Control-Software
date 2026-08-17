import { sceneOrderForSequences } from "./story.ts";
import type { CustomStoryStructure } from "./screenplay.ts";

export type BoardScenePlacement =
  | { kind: "before"; sequenceId: string; anchorSceneId: string }
  | { kind: "after"; sequenceId: string; anchorSceneId: string }
  | { kind: "append"; sequenceId: string }
  | { kind: "empty"; sequenceId: string }
  | { kind: "unassigned" };

export interface BoardPointerPlacementInput {
  sequenceId: string;
  targetSceneId?: string;
  targetTop?: number;
  targetHeight?: number;
  pointerY?: number;
  sequenceSceneCount: number;
}

export interface BoardPlacementOption {
  id: string;
  label: string;
  placement: BoardScenePlacement;
  disabled: boolean;
}

export function resolveBoardPointerPlacement(input: BoardPointerPlacementInput): BoardScenePlacement {
  if (!input.sequenceSceneCount) return { kind: "empty", sequenceId: input.sequenceId };
  if (!input.targetSceneId) return { kind: "append", sequenceId: input.sequenceId };
  const midpoint = (input.targetTop ?? 0) + Math.max(0, input.targetHeight ?? 0) / 2;
  return (input.pointerY ?? midpoint) < midpoint
    ? { kind: "before", sequenceId: input.sequenceId, anchorSceneId: input.targetSceneId }
    : { kind: "after", sequenceId: input.sequenceId, anchorSceneId: input.targetSceneId };
}

/** Applies exactly the placement previewed by the board without touching screenplay blocks. */
export function applyBoardScenePlacement(
  structure: CustomStoryStructure,
  sceneId: string,
  placement: BoardScenePlacement,
): CustomStoryStructure {
  if (!structure.sceneOrder.includes(sceneId)) return structure;
  if (placement.kind !== "unassigned" && !structure.sequences.some((sequence) => sequence.id === placement.sequenceId)) return structure;
  if ((placement.kind === "before" || placement.kind === "after") && placement.anchorSceneId === sceneId) return structure;
  const sequences = structure.sequences.map((sequence) => ({ ...sequence, sceneIds: sequence.sceneIds.filter((id) => id !== sceneId) }));
  if (placement.kind !== "unassigned") {
    const target = sequences.find((sequence) => sequence.id === placement.sequenceId)!;
    let index = target.sceneIds.length;
    if (placement.kind === "before" || placement.kind === "after") {
      const anchorIndex = target.sceneIds.indexOf(placement.anchorSceneId);
      if (anchorIndex < 0) return structure;
      index = anchorIndex + (placement.kind === "after" ? 1 : 0);
    }
    target.sceneIds.splice(index, 0, sceneId);
  }
  const next = { ...structure, sequences, sceneOrder: sceneOrderForSequences(structure, sequences) };
  return samePlacementState(structure, next) ? structure : next;
}

export function boardPlacementOptions(
  structure: CustomStoryStructure,
  sceneId: string,
): BoardPlacementOption[] {
  const options: BoardPlacementOption[] = [];
  for (const sequence of structure.sequences) {
    if (!sequence.sceneIds.length) {
      const placement: BoardScenePlacement = { kind: "empty", sequenceId: sequence.id };
      options.push(option(`${sequence.id}:empty`, `Move to empty ${sequence.title || "sequence"}`, placement, structure, sceneId));
      continue;
    }
    const first = sequence.sceneIds[0];
    const last = sequence.sceneIds[sequence.sceneIds.length - 1];
    options.push(option(`${sequence.id}:start`, `Move to beginning of ${sequence.title || "sequence"}`, { kind: "before", sequenceId: sequence.id, anchorSceneId: first }, structure, sceneId));
    options.push(option(`${sequence.id}:end`, `Move to end of ${sequence.title || "sequence"}`, { kind: "after", sequenceId: sequence.id, anchorSceneId: last }, structure, sceneId));
  }
  options.push(option("unassigned", "Move to Unassigned", { kind: "unassigned" }, structure, sceneId));
  return options;
}

export function neighboringBoardPlacement(
  structure: CustomStoryStructure,
  sceneId: string,
  direction: -1 | 1,
): BoardScenePlacement | undefined {
  const sequence = structure.sequences.find((candidate) => candidate.sceneIds.includes(sceneId));
  if (!sequence) return undefined;
  const index = sequence.sceneIds.indexOf(sceneId);
  const neighbor = sequence.sceneIds[index + direction];
  if (!neighbor) return undefined;
  return direction < 0
    ? { kind: "before", sequenceId: sequence.id, anchorSceneId: neighbor }
    : { kind: "after", sequenceId: sequence.id, anchorSceneId: neighbor };
}

export function describeBoardPlacement(
  structure: CustomStoryStructure,
  sceneId: string,
  placement: BoardScenePlacement,
): string {
  if (placement.kind === "unassigned") return `Moved ${sceneId} to Unassigned.`;
  const sequence = structure.sequences.find((candidate) => candidate.id === placement.sequenceId);
  const title = sequence?.title || "sequence";
  if (placement.kind === "before") return `Moved ${sceneId} before ${placement.anchorSceneId} in ${title}.`;
  if (placement.kind === "after") return `Moved ${sceneId} after ${placement.anchorSceneId} in ${title}.`;
  return `Moved ${sceneId} to ${placement.kind === "empty" ? "empty " : "the end of "}${title}.`;
}

function option(
  id: string,
  label: string,
  placement: BoardScenePlacement,
  structure: CustomStoryStructure,
  sceneId: string,
): BoardPlacementOption {
  return { id, label, placement, disabled: applyBoardScenePlacement(structure, sceneId, placement) === structure };
}

function samePlacementState(left: CustomStoryStructure, right: CustomStoryStructure): boolean {
  return JSON.stringify(left.sceneOrder) === JSON.stringify(right.sceneOrder)
    && JSON.stringify(left.sequences.map((sequence) => [sequence.id, sequence.sceneIds]))
      === JSON.stringify(right.sequences.map((sequence) => [sequence.id, sequence.sceneIds]));
}
