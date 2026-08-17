/**
 * Fountain-inspired plain-text serialization for screenplay documents.
 *
 * This follows the Fountain conventions (fountain.io) closely enough that a
 * document exported here reads correctly in other Fountain tools, with two
 * documented SCS conventions where Fountain has no equivalent element:
 *
 *  - Shot: a lone UPPERCASE paragraph (not a heading/transition) is read back
 *    as a Shot. Plain Fountain would treat it as action.
 *  - Note: `[[text]]` becomes a Note *block* rather than an inline note.
 *
 * See docs/EDITOR.md for the full rules.
 */

import {
  TITLE_PAGE_FIELD_LABELS,
  TITLE_PAGE_FIELD_ORDER,
  canonicalTitlePageField,
  newBlock,
  isSceneHeadingText,
  isTransitionText,
  type ScreenplayBlock,
  type ScreenplayDocument,
  type TitlePage,
  type TitlePageBlock,
  type TitlePageField,
  titlePageFieldValue,
} from "./screenplay.ts";

/* ---- Serialize ---------------------------------------------------------- */

export function toFountain(doc: ScreenplayDocument): string {
  const out: string[] = [];
  for (const field of TITLE_PAGE_FIELD_ORDER) {
    const value = titlePageFieldValue(doc.titlePage, field).trim();
    if (!value) continue;
    const lines = value.replace(/\r\n?/g, "\n").split("\n");
    const label = field === "draftDate" ? "Draft date" : TITLE_PAGE_FIELD_LABELS[field];
    out.push(`${label}: ${lines[0]}`);
    out.push(...lines.slice(1).map((line) => `   ${line}`));
  }
  if (out.length) out.push("");

  doc.blocks.forEach((block, i) => {
    const text = block.text.trim();
    if (!text) return;
    const next = doc.blocks[i + 1];
    switch (block.type) {
      case "scene_heading":
        out.push(isSceneHeadingText(text) ? text.toUpperCase() : `.${text.toUpperCase()}`, "");
        break;
      case "action":
        // Force with `!` when an all-caps action would otherwise be misread.
        out.push(text === text.toUpperCase() ? `!${text}` : text, "");
        break;
      case "character": {
        const cue = text.toUpperCase();
        // A cue is only a cue in Fountain when dialogue follows; force it otherwise.
        const spoken = next && (next.type === "dialogue" || next.type === "parenthetical");
        out.push(spoken ? cue : `@${cue}`);
        if (!spoken) out.push("");
        break;
      }
      case "parenthetical": {
        const wrapped = text.startsWith("(") ? text : `(${text})`;
        out.push(wrapped);
        if (!next || (next.type !== "dialogue" && next.type !== "parenthetical")) out.push("");
        break;
      }
      case "dialogue":
        out.push(text);
        if (!next || (next.type !== "dialogue" && next.type !== "parenthetical")) out.push("");
        break;
      case "transition":
        out.push(isTransitionText(text) ? text.toUpperCase() : `> ${text.toUpperCase()}`, "");
        break;
      case "shot":
        out.push(text.toUpperCase(), "");
        break;
      case "note":
        out.push(`[[${text}]]`, "");
        break;
      default:
        out.push(text, "");
    }
  });
  return out.join("\n").replace(/\n+$/, "") + "\n";
}

export interface FountainExportResult {
  text: string;
  warnings: string[];
}

/** Provides the warnings a UI should surface when Fountain cannot encode imported FDX details. */
export function toFountainWithWarnings(doc: ScreenplayDocument): FountainExportResult {
  const blocks = doc.titlePage.blocks ?? [];
  const warnings: string[] = [];
  const canonical = blocks.flatMap((block) => {
    const field = canonicalTitlePageField(block.type || block.metadata?.Type || "");
    return field ? [field] : [];
  });
  if (blocks.some((block) => !canonicalTitlePageField(block.type || block.metadata?.Type || ""))) {
    warnings.push("Fountain has no canonical representation for one or more custom title-page paragraphs; they remain in the project/FDX data but are omitted from the Fountain text.");
  }
  if (new Set(canonical).size !== canonical.length) {
    warnings.push("Fountain emits one value per canonical title-page field; duplicate imported title-page paragraphs remain in the project/FDX data but are omitted from the Fountain text.");
  }
  const importedOrder = canonical.filter((field, index) => canonical.indexOf(field) === index);
  const fountainOrder = TITLE_PAGE_FIELD_ORDER.filter((field) => importedOrder.includes(field));
  if (importedOrder.some((field, index) => field !== fountainOrder[index])) {
    warnings.push("Fountain normalizes canonical title-page field order; the original paragraph order remains in the project/FDX data.");
  }
  if (blocks.some((block) => !block.text.trim())) {
    warnings.push("Fountain omits empty title-page paragraphs; those placeholders and their attributes remain in the project/FDX data.");
  }
  if (blocks.some((block) => Object.keys(block.metadata ?? {}).some((name) => name !== "Type"))) {
    warnings.push("Fountain cannot encode imported title-page positioning or vendor attributes; those attributes remain in the project/FDX data.");
  }
  if (blocks.some((block) => (block.textRuns ?? []).some((run) => run.bold || run.italic || run.underline || run.strikeout || run.revisionId !== undefined || Object.keys(run.metadata ?? {}).length > 0))) {
    warnings.push("Fountain cannot encode imported title-page character-run styling; those runs remain in the project/FDX data while their plain text is exported.");
  }
  return { text: toFountain(doc), warnings };
}

/* ---- Parse -------------------------------------------------------------- */

const TITLE_KEY_RE = /^([A-Za-z][A-Za-z ._-]*):\s*(.*)$/;

function titleLine(line: string): { field: TitlePageField; label: string; text: string } | undefined {
  const match = TITLE_KEY_RE.exec(line);
  if (!match) return undefined;
  const field = canonicalTitlePageField(match[1]);
  return field ? { field, label: match[1].trim(), text: match[2] } : undefined;
}

function setTitlePageField(titlePage: TitlePage, field: TitlePageField, value: string): void {
  titlePage[field] = value;
}

export function parseFountain(text: string): ScreenplayDocument {
  const doc: ScreenplayDocument = {
    titlePage: { title: "", author: "" },
    blocks: [],
    sceneNotes: {},
  };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  // Title page: leading recognized `Key: value` records, with indented continuations.
  if (i < lines.length && titleLine(lines[i])) {
    const titleBlocks: TitlePageBlock[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const parsed = titleLine(lines[i]);
      if (parsed) {
        titleBlocks.push({ type: parsed.label, text: parsed.text.trim(), metadata: {} });
      } else if (titleBlocks.length && /^\s+/.test(lines[i])) {
        const current = titleBlocks[titleBlocks.length - 1];
        current.text += `\n${lines[i].replace(/^\s+/, "")}`;
      } else {
        break;
      }
      i++;
    }
    doc.titlePage.blocks = titleBlocks;
    const assigned = new Set<TitlePageField>();
    for (const block of titleBlocks) {
      const field = canonicalTitlePageField(block.type);
      if (!field || (assigned.has(field) && titlePageFieldValue(doc.titlePage, field).trim())) continue;
      setTitlePageField(doc.titlePage, field, block.text.trim());
      if (block.text.trim()) assigned.add(field);
    }
  }

  // Split the rest into paragraphs separated by blank lines.
  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      if (current.length) paragraphs.push(current);
      current = [];
    } else {
      current.push(lines[i]);
    }
  }
  if (current.length) paragraphs.push(current);

  for (const para of paragraphs) {
    const first = para[0].trim();
    const single = para.length === 1;
    const joined = para.map((l) => l.trim()).join("\n");

    if (first.startsWith(".") && !first.startsWith("..")) {
      doc.blocks.push(newBlock("scene_heading", first.slice(1).trim()));
    } else if (isSceneHeadingText(first) && single) {
      doc.blocks.push(newBlock("scene_heading", first));
    } else if (first.startsWith("!")) {
      doc.blocks.push(newBlock("action", joined.replace(/^!/, "")));
    } else if (first.startsWith(">") && !first.endsWith("<")) {
      doc.blocks.push(newBlock("transition", first.slice(1).trim()));
    } else if (single && isTransitionText(first)) {
      doc.blocks.push(newBlock("transition", first));
    } else if (single && first.startsWith("[[") && first.endsWith("]]")) {
      doc.blocks.push(newBlock("note", first.slice(2, -2).trim()));
    } else if (first.startsWith("@") || (isCueLike(first) && !single)) {
      // Character cue followed by parentheticals / dialogue lines.
      doc.blocks.push(newBlock("character", first.replace(/^@/, "")));
      let dialogue: string[] = [];
      const flush = () => {
        if (dialogue.length) doc.blocks.push(newBlock("dialogue", dialogue.join("\n")));
        dialogue = [];
      };
      for (const raw of para.slice(1)) {
        const line = raw.trim();
        if (line.startsWith("(") && line.endsWith(")")) {
          flush();
          doc.blocks.push(newBlock("parenthetical", line));
        } else {
          dialogue.push(line);
        }
      }
      flush();
    } else if (single && isCueLike(first)) {
      // SCS convention: a lone uppercase paragraph is a Shot.
      doc.blocks.push(newBlock("shot", first));
    } else {
      doc.blocks.push(newBlock("action", joined));
    }
  }

  if (!doc.blocks.length) doc.blocks.push(newBlock("scene_heading"));
  return doc;
}

/** Uppercase, contains at least one letter, and isn't a heading/transition. */
function isCueLike(line: string): boolean {
  return (
    line === line.toUpperCase() &&
    /[A-Z]/.test(line) &&
    !isSceneHeadingText(line) &&
    !isTransitionText(line)
  );
}

/** Convenience used by tests and future import paths. */
export function blocksToFountain(blocks: ScreenplayBlock[]): string {
  return toFountain({ titlePage: { title: "", author: "" }, blocks, sceneNotes: {} });
}
