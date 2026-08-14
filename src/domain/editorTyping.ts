import { parseHeading, type ScreenplayBlock, type ScreenplayElementType } from "./screenplay.ts";

export type SceneHeadingCompletionStage = "prefix" | "location" | "separator" | "time";

export interface SceneHeadingCompletion {
  stage: SceneHeadingCompletionStage;
  base: string;
  candidates: string[];
}

const HEADING_PREFIXES = ["INT.", "EXT.", "I/E."];
const STANDARD_TIMES = ["DAY", "NIGHT", "CONTINUOUS"];

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Return the context-sensitive values that Tab may insert into a scene heading. */
export function sceneHeadingCompletion(
  blocks: readonly ScreenplayBlock[],
  activeBlockId: string,
  text: string,
): SceneHeadingCompletion | null {
  const value = text.toUpperCase();
  const historical = blocks
    .filter((block) => block.type === "scene_heading" && block.id !== activeBlockId)
    .map((block) => parseHeading(block.text.trim()));
  const locations = unique(historical.map((heading) => heading.location));
  const customTimes = unique(historical.map((heading) => heading.timeOfDay))
    .filter((time) => !STANDARD_TIMES.includes(time));

  const prefixMatch = value.match(/^(INT\.|EXT\.|I\/E\.)(?:\s+(.*))?$/);
  if (!prefixMatch) {
    const typed = value.trim();
    const candidates = HEADING_PREFIXES.filter((prefix) => prefix.startsWith(typed));
    return candidates.length || typed === "" ? { stage: "prefix", base: "", candidates } : null;
  }

  const prefix = prefixMatch[1];
  const remainder = prefixMatch[2];
  if (remainder === undefined) {
    return { stage: "prefix", base: "", candidates: HEADING_PREFIXES };
  }

  const separatorIndex = remainder.lastIndexOf(" - ");
  if (separatorIndex >= 0) {
    const location = remainder.slice(0, separatorIndex).trim();
    const typedTime = remainder.slice(separatorIndex + 3).trim();
    const candidates = unique([...STANDARD_TIMES, ...customTimes])
      .filter((time) => time.startsWith(typedTime));
    return { stage: "time", base: `${prefix} ${location} - `, candidates };
  }

  const typedLocation = remainder.trim();
  const matchingLocations = locations.filter((location) => location.startsWith(typedLocation));
  const committedExactLocation = remainder.endsWith(" ") && matchingLocations.includes(typedLocation);
  if (committedExactLocation) {
    return { stage: "separator", base: `${prefix} ${typedLocation}`, candidates: [" - "] };
  }
  if (!typedLocation || matchingLocations.some((location) => location !== typedLocation)) {
    return { stage: "location", base: `${prefix} `, candidates: matchingLocations };
  }

  return { stage: "separator", base: `${prefix} ${typedLocation}`, candidates: [" - "] };
}

/**
 * A single character/dialogue turn returns to action. Once an uninterrupted
 * exchange contains at least two turns, Enter keeps the conversation flowing.
 */
export function typeAfterDialogueEnter(
  blocks: readonly ScreenplayBlock[],
  dialogueIndex: number,
): ScreenplayElementType {
  let turns = 0;
  let hasDialogue = false;

  for (let index = dialogueIndex; index >= 0; index--) {
    const type = blocks[index]?.type;
    if (type === "dialogue") {
      hasDialogue = true;
      continue;
    }
    if (type === "parenthetical") continue;
    if (type === "character" && hasDialogue) {
      turns++;
      hasDialogue = false;
      continue;
    }
    break;
  }

  return turns >= 2 ? "character" : "action";
}
