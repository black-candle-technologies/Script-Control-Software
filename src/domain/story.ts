import { deriveScenes, type CustomStoryStructure, type ScreenplayBlock } from "./screenplay.ts";

export function resolveStoryStructure(blocks: ScreenplayBlock[], saved?: CustomStoryStructure): CustomStoryStructure {
  const scenes = deriveScenes(blocks);
  if (!saved) return defaultStructure(blocks);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const acts = saved.acts.length ? saved.acts.map((act) => ({ ...act })) : [{ id: "act-1", title: "Act I" }];
  const actIds = new Set(acts.map((act) => act.id));
  const assigned = new Set<string>();
  const sequences = saved.sequences
    .filter((sequence) => actIds.has(sequence.actId))
    .map((sequence) => ({
      ...sequence,
      sceneIds: sequence.sceneIds.filter((id) => sceneIds.has(id) && !assigned.has(id) && Boolean(assigned.add(id))),
    }));
  const sequenceIds = new Set(sequences.map((sequence) => sequence.id));
  const beats = saved.beats.map((beat) => ({
    ...beat,
    sceneId: beat.sceneId && sceneIds.has(beat.sceneId) ? beat.sceneId : undefined,
    sequenceId: beat.sequenceId && sequenceIds.has(beat.sequenceId) ? beat.sequenceId : undefined,
    moments: beat.moments ?? [],
  }));
  const nodeIds = new Set([
    ...acts.map((act) => act.id),
    ...sequences.map((sequence) => sequence.id),
    ...sceneIds,
    ...beats.map((beat) => beat.id),
  ]);
  return {
    ...saved,
    acts,
    sequences,
    beats,
    sceneOrder: unique(saved.sceneOrder.filter((id) => sceneIds.has(id)).concat(scenes.map((scene) => scene.id))),
    ...(saved.connections ? { connections: saved.connections.filter((connection) => nodeIds.has(connection.fromId) && nodeIds.has(connection.toId)) } : {}),
  };
}

export function moveStoryScene(structure: CustomStoryStructure, sceneId: string, to: number): CustomStoryStructure {
  const sceneOrder = structure.sceneOrder.filter((id) => id !== sceneId);
  sceneOrder.splice(Math.max(0, Math.min(to, sceneOrder.length)), 0, sceneId);
  return { ...structure, sceneOrder };
}

/**
 * Turn the visible Act -> Sequence order into screenplay scene order. Scenes
 * outside a sequence remain present, in their existing relative order.
 */
export function sceneOrderForSequences(
  structure: Pick<CustomStoryStructure, "acts" | "sceneOrder">,
  sequences: readonly CustomStoryStructure["sequences"][number][],
): string[] {
  const position = new Map(structure.sceneOrder.map((id, index) => [id, index]));
  const orderedAssigned = structure.acts.flatMap((act) => sequences
    .filter((sequence) => sequence.actId === act.id)
    .flatMap((sequence) => sequence.sceneIds
      .filter((id) => position.has(id))
      .sort((left, right) => position.get(left)! - position.get(right)!)));
  const assigned = new Set(orderedAssigned);
  const unassigned = structure.sceneOrder.filter((id) => !assigned.has(id));
  return unique([...orderedAssigned, ...unassigned]);
}

/**
 * Apply the outline's scene order to the screenplay while keeping every scene's
 * paragraphs together. Scene ids not present in the requested order are kept at
 * the end so an incomplete board can never discard script content.
 */
export function applyStorySceneOrder(blocks: ScreenplayBlock[], requestedOrder: readonly string[]): ScreenplayBlock[] {
  const scenes = deriveScenes(blocks);
  if (!scenes.length) return blocks;
  const prefix = blocks.slice(0, scenes[0].blockIndex);
  const chunks = new Map(scenes.map((scene, index) => [
    scene.id,
    blocks.slice(scene.blockIndex, scenes[index + 1]?.blockIndex ?? blocks.length),
  ]));
  const order = unique(requestedOrder.filter((id) => chunks.has(id)).concat(scenes.map((scene) => scene.id)));
  if (order.every((id, index) => id === scenes[index]?.id)) return blocks;
  return [...prefix, ...order.flatMap((id) => chunks.get(id) ?? [])];
}

function defaultStructure(blocks: ScreenplayBlock[]): CustomStoryStructure {
  const scenes = deriveScenes(blocks);
  const acts: CustomStoryStructure["acts"] = [];
  let currentAct = { id: "act-1", title: "Act I" };
  acts.push(currentAct);
  for (const scene of scenes) {
    const marker = blocks.slice(0, scene.blockIndex).reverse().find((block) => block.type === "new_act" && block.text.trim());
    if (marker && marker.id !== currentAct.id && !acts.some((act) => act.id === marker.id)) {
      currentAct = { id: marker.id, title: marker.text.trim() };
      acts.push(currentAct);
    }
  }
  const beats = blocks.flatMap((block, index) => {
    if (block.type !== "note" || !block.text.trim()) return [];
    const scene = [...scenes].reverse().find((candidate) => candidate.blockIndex < index);
    return scene ? [{ id: block.id, text: block.text.trim(), sceneId: scene.id, status: "drafted" as const, moments: [] }] : [];
  });
  return { acts, sequences: [], beats, sceneOrder: scenes.map((scene) => scene.id) };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
