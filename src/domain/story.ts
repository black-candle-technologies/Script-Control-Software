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
  if (!sequences.length) sequences.push({ id: "sequence-1", actId: acts[0].id, title: "Sequence 1", sceneIds: [] });
  sequences[0].sceneIds.push(...scenes.map((scene) => scene.id).filter((id) => !assigned.has(id)));
  const sequenceIds = new Set(sequences.map((sequence) => sequence.id));
  return {
    acts,
    sequences,
    beats: saved.beats.map((beat) => ({
      ...beat,
      sceneId: beat.sceneId && sceneIds.has(beat.sceneId) ? beat.sceneId : undefined,
      sequenceId: beat.sequenceId && sequenceIds.has(beat.sequenceId) ? beat.sequenceId : undefined,
      moments: beat.moments ?? [],
    })),
    sceneOrder: unique(saved.sceneOrder.filter((id) => sceneIds.has(id)).concat(scenes.map((scene) => scene.id))),
  };
}

export function moveStoryScene(structure: CustomStoryStructure, sceneId: string, to: number): CustomStoryStructure {
  const sceneOrder = structure.sceneOrder.filter((id) => id !== sceneId);
  sceneOrder.splice(Math.max(0, Math.min(to, sceneOrder.length)), 0, sceneId);
  return { ...structure, sceneOrder };
}

function defaultStructure(blocks: ScreenplayBlock[]): CustomStoryStructure {
  const scenes = deriveScenes(blocks);
  const acts: CustomStoryStructure["acts"] = [];
  const sequences: CustomStoryStructure["sequences"] = [];
  let currentAct = { id: "act-1", title: "Act I" };
  acts.push(currentAct);
  let currentSequence: CustomStoryStructure["sequences"][number] | undefined;
  for (const scene of scenes) {
    const marker = blocks.slice(0, scene.blockIndex).reverse().find((block) => block.type === "new_act" && block.text.trim());
    if (marker && marker.id !== currentAct.id && !acts.some((act) => act.id === marker.id)) {
      currentAct = { id: marker.id, title: marker.text.trim() };
      acts.push(currentAct);
      currentSequence = undefined;
    }
    if (!currentSequence || currentSequence.actId !== currentAct.id || currentSequence.sceneIds.length === 8) {
      currentSequence = { id: `${currentAct.id}-sequence-${sequences.filter((sequence) => sequence.actId === currentAct.id).length + 1}`, actId: currentAct.id, title: `Sequence ${sequences.filter((sequence) => sequence.actId === currentAct.id).length + 1}`, sceneIds: [] };
      sequences.push(currentSequence);
    }
    currentSequence.sceneIds.push(scene.id);
  }
  if (!sequences.length) sequences.push({ id: "sequence-1", actId: currentAct.id, title: "Sequence 1", sceneIds: [] });
  const beats = blocks.flatMap((block, index) => {
    if (block.type !== "note" || !block.text.trim()) return [];
    const scene = [...scenes].reverse().find((candidate) => candidate.blockIndex < index);
    return scene ? [{ id: block.id, text: block.text.trim(), sceneId: scene.id, status: "drafted" as const, moments: [] }] : [];
  });
  return { acts, sequences, beats, sceneOrder: scenes.map((scene) => scene.id) };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
