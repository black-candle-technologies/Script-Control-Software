import type { ScreenplayBlock, ScreenplayDocument } from "./screenplay.ts";

/** A precise, transient navigation target. It is derived UI data, never screenplay state. */
export type ScriptTargetSource =
  | "object-continuity"
  | "production-evidence"
  | "character-dialogue"
  | "location-appearance"
  | "import-warning"
  | "other";

export interface ScriptTarget {
  documentId: string;
  blockId: string;
  sceneId?: string;
  startOffset?: number;
  endOffset?: number;
  matchedText?: string;
  /** Zero-based occurrence of this entity within the source block. */
  occurrence?: number;
  source?: ScriptTargetSource;
  reason?: string;
}

export type ScriptTargetResolution =
  | {
    kind: "exact" | "relocated";
    blockId: string;
    sceneId?: string;
    startOffset: number;
    endOffset: number;
    matchedText: string;
    occurrence: number;
  }
  | {
    kind: "block";
    blockId: string;
    sceneId?: string;
    caretOffset: number;
    reason: "invalid-range" | "range-unavailable" | "text-changed";
  }
  | {
    kind: "scene";
    blockId: string;
    sceneId: string;
    caretOffset: number;
    reason: "block-missing";
  }
  | {
    kind: "missing";
    reason: "document" | "block" | "scene";
  };

type TargetDocument = Pick<ScreenplayDocument, "id" | "blocks">;

/**
 * Resolve only inside the target's original document and stable block. A stale
 * target may relocate within that same block, then fall back to the block or
 * original scene. It can never jump to a coincidental global text match.
 */
export function resolveScriptTarget(target: ScriptTarget, document: TargetDocument): ScriptTargetResolution {
  if (document.id && document.id !== target.documentId) return { kind: "missing", reason: "document" };
  const blockIndex = document.blocks.findIndex((block) => block.id === target.blockId);
  if (blockIndex < 0) {
    if (target.sceneId) {
      const scene = document.blocks.find((block) => block.id === target.sceneId && block.type === "scene_heading");
      if (scene) {
        return {
          kind: "scene",
          blockId: scene.id,
          sceneId: scene.id,
          caretOffset: 0,
          reason: "block-missing",
        };
      }
      return { kind: "missing", reason: "scene" };
    }
    return { kind: "missing", reason: "block" };
  }
  const block = document.blocks[blockIndex];
  const sceneId = sceneForBlock(document.blocks, blockIndex);

  const { startOffset, endOffset } = target;
  const hasRange = startOffset !== undefined || endOffset !== undefined;
  const validRange = typeof startOffset === "number"
    && typeof endOffset === "number"
    && Number.isInteger(startOffset)
    && Number.isInteger(endOffset)
    && startOffset >= 0
    && endOffset >= startOffset
    && endOffset <= block.text.length;
  if (validRange && target.matchedText && block.text.slice(startOffset, endOffset) === target.matchedText) {
    return exactResolution("exact", target, startOffset, endOffset, target.matchedText, sceneId);
  }

  if (target.matchedText) {
    const occurrences = textOccurrences(block.text, target.matchedText);
    const selected = (target.occurrence === undefined ? undefined : occurrences[target.occurrence])
      ?? nearestOccurrence(occurrences, startOffset ?? 0);
    if (selected) {
      return exactResolution(
        "relocated",
        target,
        selected.startOffset,
        selected.endOffset,
        block.text.slice(selected.startOffset, selected.endOffset),
        sceneId,
      );
    }
  }

  return {
    kind: "block",
    blockId: block.id,
    ...(sceneId ? { sceneId } : {}),
    caretOffset: clamp(startOffset ?? 0, 0, block.text.length),
    reason: validRange ? "text-changed" : hasRange ? "invalid-range" : "range-unavailable",
  };
}

function exactResolution(
  kind: "exact" | "relocated",
  target: ScriptTarget,
  startOffset: number,
  endOffset: number,
  matchedText: string,
  sceneId: string | undefined,
): Extract<ScriptTargetResolution, { kind: "exact" | "relocated" }> {
  return {
    kind,
    blockId: target.blockId,
    ...(sceneId ? { sceneId } : {}),
    startOffset,
    endOffset,
    matchedText,
    occurrence: target.occurrence ?? 0,
  };
}

function sceneForBlock(blocks: ScreenplayBlock[], blockIndex: number): string | undefined {
  for (let index = blockIndex; index >= 0; index--) {
    if (blocks[index].type === "scene_heading") return blocks[index].id;
  }
  return undefined;
}

function textOccurrences(text: string, needle: string): { startOffset: number; endOffset: number }[] {
  if (!needle) return [];
  const source = text.toLocaleLowerCase();
  const query = needle.toLocaleLowerCase();
  const found: { startOffset: number; endOffset: number }[] = [];
  let from = 0;
  while (from <= source.length - query.length) {
    const startOffset = source.indexOf(query, from);
    if (startOffset < 0) break;
    found.push({ startOffset, endOffset: startOffset + query.length });
    from = startOffset + Math.max(1, query.length);
  }
  return found;
}

function nearestOccurrence(
  occurrences: { startOffset: number; endOffset: number }[],
  expectedStart: number,
): { startOffset: number; endOffset: number } | undefined {
  return [...occurrences].sort((left, right) =>
    Math.abs(left.startOffset - expectedStart) - Math.abs(right.startOffset - expectedStart)
    || left.startOffset - right.startOffset,
  )[0];
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
