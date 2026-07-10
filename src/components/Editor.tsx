import { useLayoutEffect, useRef } from "react";
import {
  ELEMENT_TYPES,
  enterCreates,
  isSceneHeadingText,
  isTransitionText,
  newBlock,
  type ScreenplayBlock,
  type ScreenplayElementType,
  type TitlePage,
} from "../domain/index.ts";

interface EditorProps {
  blocks: ScreenplayBlock[];
  onBlocksChange: (blocks: ScreenplayBlock[]) => void;
  titlePage: TitlePage;
  onTitlePageChange: (titlePage: TitlePage) => void;
  onActiveBlock: (id: string) => void;
  /** Bump `nonce` to scroll to and focus a block (used by the scene navigator). */
  focusRequest: { id: string; nonce: number } | null;
  readOnly?: boolean;
}

function resize(el: HTMLTextAreaElement) {
  el.style.height = "0";
  el.style.height = `${el.scrollHeight}px`;
}

export default function Editor({
  blocks,
  onBlocksChange,
  titlePage,
  onTitlePageChange,
  onActiveBlock,
  focusRequest,
  readOnly = false,
}: EditorProps) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; pos: number } | null>(null);
  const lastFocusNonce = useRef(0);

  // Apply structural focus moves (splits, merges, navigator jumps) after render,
  // and keep textarea heights in sync with their content.
  useLayoutEffect(() => {
    for (const el of refs.current.values()) resize(el);
    if (pendingFocus.current) {
      const el = refs.current.get(pendingFocus.current.id);
      if (el) {
        el.focus();
        el.setSelectionRange(pendingFocus.current.pos, pendingFocus.current.pos);
      }
      pendingFocus.current = null;
    }
  });

  useLayoutEffect(() => {
    if (!focusRequest || focusRequest.nonce === lastFocusNonce.current) return;
    lastFocusNonce.current = focusRequest.nonce;
    const el = refs.current.get(focusRequest.id);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [focusRequest]);

  const update = (index: number, patch: Partial<ScreenplayBlock>) => {
    const next = blocks.slice();
    next[index] = { ...next[index], ...patch };
    onBlocksChange(next);
  };

  const handleChange = (index: number, block: ScreenplayBlock, el: HTMLTextAreaElement) => {
    if (readOnly) return;
    let value = el.value;
    let type = block.type;
    const singleLine = !value.includes("\n");

    // Fountain-inspired live recognition while typing.
    if (type === "action" && singleLine) {
      if (isSceneHeadingText(value)) type = "scene_heading";
      else if (isTransitionText(value)) type = "transition";
      else if (/^\.(?!\.)./.test(value)) {
        type = "scene_heading";
        value = value.slice(1);
      } else if (/^@./.test(value)) {
        type = "character";
        value = value.slice(1);
      }
    } else if (type === "dialogue" && block.text === "" && value.startsWith("(")) {
      type = "parenthetical";
    }

    resize(el);
    update(index, { text: value, type });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    index: number,
    block: ScreenplayBlock,
  ) => {
    if (readOnly) return;
    const el = e.currentTarget;
    const { selectionStart, selectionEnd } = el;
    const collapsed = selectionStart === selectionEnd;

    // Ctrl/Cmd+1..8 — set the element type directly.
    if ((e.ctrlKey || e.metaKey) && e.key >= "1" && e.key <= "8") {
      e.preventDefault();
      update(index, { type: ELEMENT_TYPES[Number(e.key) - 1] });
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const i = ELEMENT_TYPES.indexOf(block.type);
      const n = ELEMENT_TYPES.length;
      update(index, { type: ELEMENT_TYPES[(i + (e.shiftKey ? -1 : 1) + n) % n] });
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const next = blocks.slice();
      if (block.text === "") {
        // Enter on an empty element steps it forward instead of stacking blanks.
        const to = enterCreates[block.type];
        if (to !== block.type) {
          update(index, { type: to });
          return;
        }
      }
      const before = block.text.slice(0, selectionStart);
      const after = block.text.slice(selectionEnd);
      // Splitting mid-text keeps the type; Enter at the end flows to the next element.
      const created = newBlock(after ? block.type : enterCreates[block.type], after);
      next[index] = { ...block, text: before };
      next.splice(index + 1, 0, created);
      pendingFocus.current = { id: created.id, pos: 0 };
      onBlocksChange(next);
      return;
    }

    if (e.key === "Backspace" && collapsed && selectionStart === 0 && index > 0) {
      e.preventDefault();
      const prev = blocks[index - 1];
      const next = blocks.slice();
      next[index - 1] = { ...prev, text: prev.text + block.text };
      next.splice(index, 1);
      pendingFocus.current = { id: prev.id, pos: prev.text.length };
      onBlocksChange(next);
      return;
    }

    if (e.key === "Delete" && collapsed && selectionStart === block.text.length && index < blocks.length - 1) {
      e.preventDefault();
      const after = blocks[index + 1];
      const next = blocks.slice();
      next[index] = { ...block, text: block.text + after.text };
      next.splice(index + 1, 1);
      pendingFocus.current = { id: block.id, pos: block.text.length };
      onBlocksChange(next);
      return;
    }

    if (e.key === "ArrowUp" && index > 0 && !el.value.slice(0, selectionStart).includes("\n")) {
      e.preventDefault();
      const prev = blocks[index - 1];
      pendingFocus.current = { id: prev.id, pos: prev.text.length };
      onBlocksChange(blocks.slice());
      return;
    }

    if (
      e.key === "ArrowDown" &&
      index < blocks.length - 1 &&
      !el.value.slice(selectionEnd).includes("\n")
    ) {
      e.preventDefault();
      pendingFocus.current = { id: blocks[index + 1].id, pos: 0 };
      onBlocksChange(blocks.slice());
    }
  };

  const placeholderFor = (type: ScreenplayElementType, index: number) =>
    index === 0 && type === "scene_heading" ? "INT. LOCATION - DAY" : "";

  return (
    <div className="editor-scroll">
      <div className="title-card page-surface">
        <input
          className="title-card-title"
          value={titlePage.title}
          readOnly={readOnly}
          placeholder="TITLE"
          onChange={(e) => onTitlePageChange({ ...titlePage, title: e.target.value })}
        />
        <span className="title-card-by">by</span>
        <input
          className="title-card-author"
          value={titlePage.author}
          readOnly={readOnly}
          placeholder="Author"
          onChange={(e) => onTitlePageChange({ ...titlePage, author: e.target.value })}
        />
        <span className="title-card-hint">Title page — full layout planned</span>
      </div>

      <div className="page page-surface">
        {blocks.map((block, index) => (
          <textarea
            key={block.id}
            rows={1}
            spellCheck={false}
            className={`blk blk-${block.type}`}
            value={block.text}
            readOnly={readOnly}
            placeholder={placeholderFor(block.type, index)}
            ref={(el) => {
              if (el) {
                refs.current.set(block.id, el);
                resize(el);
              } else {
                refs.current.delete(block.id);
              }
            }}
            onFocus={() => onActiveBlock(block.id)}
            onChange={(e) => handleChange(index, block, e.currentTarget)}
            onKeyDown={(e) => handleKeyDown(e, index, block)}
          />
        ))}
      </div>
    </div>
  );
}
