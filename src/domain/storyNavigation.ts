import type { CustomStoryStructure, Scene } from "./screenplay.ts";

export type StoryTreeNodeKind = "act" | "sequence" | "scene" | "beat" | "unassigned" | "empty";

export interface StoryTreeNode {
  id: string;
  kind: StoryTreeNodeKind;
  label: string;
  level: number;
  selectable: boolean;
  sceneId?: string;
  beatId?: string;
  children: StoryTreeNode[];
}

export interface StorySelectionState {
  selectedSceneId?: string;
  selectedBeatId?: string;
}

export interface BeatTargetResolution {
  sceneId?: string;
  source: "selected" | "active" | "unassigned";
  label: string;
}

export function buildStoryTree(
  structure: CustomStoryStructure,
  scenes: readonly Scene[],
): StoryTreeNode[] {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const assignedScenes = new Set(structure.sequences.flatMap((sequence) => sequence.sceneIds));
  const assignedBeats = new Set<string>();
  const sceneNode = (sceneId: string, level: number): StoryTreeNode | undefined => {
    const scene = sceneById.get(sceneId);
    if (!scene) return undefined;
    const beats = structure.beats.filter((beat) => beat.sceneId === sceneId).map((beat) => {
      assignedBeats.add(beat.id);
      return beatNode(beat, level + 1);
    });
    return {
      id: `scene:${sceneId}`, kind: "scene", label: sceneLabel(structure, scene), level,
      selectable: true, sceneId, children: beats,
    };
  };
  const acts = structure.acts.map((act): StoryTreeNode => {
    const sequences = structure.sequences.filter((sequence) => sequence.actId === act.id).map((sequence): StoryTreeNode => {
      const sequenceBeats = structure.beats.filter((beat) => beat.sequenceId === sequence.id && !beat.sceneId).map((beat) => {
        assignedBeats.add(beat.id);
        return beatNode(beat, 3);
      });
      const children = structure.sceneOrder
        .filter((sceneId) => sequence.sceneIds.includes(sceneId))
        .flatMap((sceneId) => sceneNode(sceneId, 3) ?? [])
        .concat(sequenceBeats);
      return {
        id: `sequence:${sequence.id}`, kind: "sequence", label: sequence.title || "Untitled sequence", level: 2,
        selectable: false, children: children.length ? children : [emptyNode(`sequence:${sequence.id}:empty`, "Empty sequence", 3)],
      };
    });
    return {
      id: `act:${act.id}`, kind: "act", label: act.title || "Untitled act", level: 1,
      selectable: false, children: sequences.length ? sequences : [emptyNode(`act:${act.id}:empty`, "No sequences", 2)],
    };
  });
  const unassignedScenes = structure.sceneOrder.filter((id) => !assignedScenes.has(id)).flatMap((id) => sceneNode(id, 2) ?? []);
  const unassignedBeats = structure.beats.filter((beat) => !assignedBeats.has(beat.id) && !beat.sceneId && !beat.sequenceId).map((beat) => beatNode(beat, 2));
  const unassignedChildren = [...unassignedScenes, ...unassignedBeats];
  return [...acts, {
    id: "unassigned", kind: "unassigned", label: "Unassigned", level: 1, selectable: false,
    children: unassignedChildren.length ? unassignedChildren : [emptyNode("unassigned:empty", "Nothing unassigned", 2)],
  }];
}

export function reconcileStorySelection(
  selection: StorySelectionState,
  structure: CustomStoryStructure,
  scenes: readonly Scene[],
): StorySelectionState {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const beatIds = new Set(structure.beats.map((beat) => beat.id));
  const selectedBeatId = selection.selectedBeatId && beatIds.has(selection.selectedBeatId) ? selection.selectedBeatId : undefined;
  const selectedBeat = selectedBeatId ? structure.beats.find((beat) => beat.id === selectedBeatId) : undefined;
  const selectedSceneId = selection.selectedSceneId && sceneIds.has(selection.selectedSceneId)
    ? selection.selectedSceneId
    : selectedBeat?.sceneId && sceneIds.has(selectedBeat.sceneId) ? selectedBeat.sceneId : undefined;
  return { ...(selectedSceneId ? { selectedSceneId } : {}), ...(selectedBeatId ? { selectedBeatId } : {}) };
}

/** Selected valid scene wins; only an unambiguous editor scene may be used as fallback. */
export function resolveNewBeatTarget(
  selectedSceneId: string | undefined,
  activeEditorSceneId: string | undefined,
  scenes: readonly Scene[],
): BeatTargetResolution {
  const valid = new Set(scenes.map((scene) => scene.id));
  if (selectedSceneId && valid.has(selectedSceneId)) {
    return { sceneId: selectedSceneId, source: "selected", label: `Selected ${sceneDescription(scenes, selectedSceneId)}` };
  }
  if (activeEditorSceneId && valid.has(activeEditorSceneId)) {
    return { sceneId: activeEditorSceneId, source: "active", label: `Active ${sceneDescription(scenes, activeEditorSceneId)}` };
  }
  return { source: "unassigned", label: "Unassigned" };
}

export function createStoryBeat(
  target: BeatTargetResolution,
  id = `beat-${crypto.randomUUID()}`,
): CustomStoryStructure["beats"][number] {
  return {
    id,
    title: "New beat",
    text: "New beat",
    ...(target.sceneId ? { sceneId: target.sceneId } : {}),
    status: "idea",
    moments: [],
    source: "scs",
  };
}

export function normalizeBeatEdit(
  beat: CustomStoryStructure["beats"][number],
  patch: Partial<CustomStoryStructure["beats"][number]>,
  structure: CustomStoryStructure,
  scenes: readonly Scene[],
): CustomStoryStructure["beats"][number] {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const sequenceIds = new Set(structure.sequences.map((sequence) => sequence.id));
  const next = { ...beat, ...patch };
  const sceneId = next.sceneId && sceneIds.has(next.sceneId) ? next.sceneId : undefined;
  const sequenceId = next.sequenceId && sequenceIds.has(next.sequenceId) ? next.sequenceId : undefined;
  const containingSequence = sceneId ? structure.sequences.find((sequence) => sequence.sceneIds.includes(sceneId))?.id : undefined;
  return {
    ...next,
    title: next.title?.trim() || undefined,
    text: next.text,
    color: normalizeStoryColor(next.color),
    sceneId,
    sequenceId: sceneId ? containingSequence : sequenceId,
    status: ["idea", "drafted", "complete"].includes(next.status) ? next.status : "idea",
    moments: next.moments.flatMap((moment) => moment.id?.trim() && typeof moment.text === "string" ? [{ id: moment.id.trim(), text: moment.text }] : []),
  };
}

function beatNode(beat: CustomStoryStructure["beats"][number], level: number): StoryTreeNode {
  return { id: `beat:${beat.id}`, kind: "beat", label: beat.title || beat.text || "Untitled beat", level, selectable: true, beatId: beat.id, sceneId: beat.sceneId, children: [] };
}

function emptyNode(id: string, label: string, level: number): StoryTreeNode {
  return { id, kind: "empty", label, level, selectable: false, children: [] };
}

function sceneLabel(structure: CustomStoryStructure, scene: Scene): string {
  const reference = scene.sceneNumber?.trim() || structure.sceneLabels?.[scene.id] || String(scene.number);
  return `Scene ${reference}: ${scene.heading}`;
}

function sceneDescription(scenes: readonly Scene[], sceneId: string): string {
  const scene = scenes.find((candidate) => candidate.id === sceneId)!;
  return `Scene ${scene.sceneNumber?.trim() || scene.number}: ${scene.heading}`;
}

function normalizeStoryColor(value: string | undefined): string | undefined {
  const color = value?.trim();
  return color && (/^#[0-9a-f]{3,8}$/i.test(color) || /^[a-z]+$/i.test(color)) ? color : undefined;
}
