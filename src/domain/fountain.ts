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
  newBlock,
  isSceneHeadingText,
  isTransitionText,
  type ScreenplayBlock,
  type ScreenplayDocument,
} from "./screenplay.ts";

/* ---- Serialize ---------------------------------------------------------- */

export function toFountain(doc: ScreenplayDocument): string {
  const out: string[] = [];
  if (doc.titlePage.title.trim()) out.push(`Title: ${doc.titlePage.title.trim()}`);
  if (doc.titlePage.author.trim()) out.push(`Author: ${doc.titlePage.author.trim()}`);
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

/* ---- Parse -------------------------------------------------------------- */

const TITLE_KEY_RE = /^(Title|Credit|Author|Authors|Source|Draft date|Contact|Notes):\s*(.*)$/i;

export function parseFountain(text: string): ScreenplayDocument {
  const doc: ScreenplayDocument = {
    titlePage: { title: "", author: "" },
    blocks: [],
    sceneNotes: {},
  };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  // Title page: leading `Key: value` lines up to the first blank line.
  if (i < lines.length && TITLE_KEY_RE.test(lines[i])) {
    while (i < lines.length && lines[i].trim() !== "") {
      const m = lines[i].match(TITLE_KEY_RE);
      if (m) {
        const key = m[1].toLowerCase();
        if (key === "title") doc.titlePage.title = m[2].trim();
        if (key === "author" || key === "authors") doc.titlePage.author = m[2].trim();
      }
      i++;
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
