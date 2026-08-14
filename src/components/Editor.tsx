import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ELEMENT_TYPES,
  enterCreates,
  deriveCharacters,
  deriveLocations,
  deriveScenes,
  isSceneHeadingText,
  isTransitionText,
  newBlock,
  paginateBlocks,
  sceneHeadingCompletion,
  typeAfterDialogueEnter,
  type ScreenplayBlock,
  type ScreenplayElementType,
  type SceneHeadingCompletionStage,
  type ProductionPage,
  type TitlePage,
} from "../domain/index.ts";

interface EditorProps {
  documentId: string;
  blocks: ScreenplayBlock[];
  onBlocksChange: (blocks: ScreenplayBlock[]) => void;
  titlePage: TitlePage;
  onTitlePageChange: (titlePage: TitlePage) => void;
  onActiveBlock: (id: string) => void;
  /** Bump `nonce` to scroll to and focus a block (used by the scene navigator). */
  focusRequest: { id: string; nonce: number } | null;
  readOnly?: boolean;
  productionPages?: ProductionPage[];
  /** Filled during render so the writing toolbar can trigger undo/redo. */
  historyRef?: React.MutableRefObject<{ undo: () => void; redo: () => void } | null>;
  /** Owner-held undo store so history survives the editor unmounting (mode switches). */
  historyStore?: React.MutableRefObject<Map<string, EditorHistory>>;
}

export interface EditorHistory {
  blocks: ScreenplayBlock[];
  undo: ScreenplayBlock[][];
  redo: ScreenplayBlock[][];
}

interface TabCompletionSession {
  blockId: string;
  stage: SceneHeadingCompletionStage;
  base: string;
  candidates: string[];
  index: number;
  renderedText: string;
}

function resize(el: HTMLTextAreaElement) {
  el.style.height = "0";
  el.style.height = `${el.scrollHeight}px`;
}

export default function Editor({
  documentId,
  blocks,
  onBlocksChange,
  titlePage,
  onTitlePageChange,
  onActiveBlock,
  focusRequest,
  readOnly = false,
  productionPages,
  historyRef,
  historyStore,
}: EditorProps) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; pos: number } | null>(null);
  const tabbedFromActionBlockId = useRef<string | null>(null);
  const tabCompletion = useRef<TabCompletionSession | null>(null);
  const lastFocusNonce = useRef(0);
  const ownHistories = useRef(new Map<string, EditorHistory>());
  const histories = historyStore ?? ownHistories;
  const history = histories.current.get(documentId) ?? { blocks, undo: [], redo: [] };
  if (!histories.current.has(documentId)) histories.current.set(documentId, history);
  else if (history.blocks !== blocks) {
    history.blocks = blocks;
    history.undo = [];
    history.redo = [];
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const pages = useMemo(() => {
    if (!productionPages?.length) return paginateBlocks(blocks);
    const byId = new Map(blocks.map((block) => [block.id, block]));
    return productionPages.map((page) => page.blockIds.map((id) => byId.get(id)).filter((block): block is ScreenplayBlock => Boolean(block)));
  }, [blocks, productionPages]);
  const indexes = useMemo(() => new Map(blocks.map((block, index) => [block.id, index])), [blocks]);
  const characterNames = useMemo(() => deriveCharacters(blocks).map((character) => character.name), [blocks]);
  const sceneHeadings = useMemo(() => deriveScenes(blocks).map((scene) => scene.heading), [blocks]);
  const locationHeadings = useMemo(() => deriveLocations(blocks).flatMap((location) => [`INT. ${location.name} - DAY`, `EXT. ${location.name} - NIGHT`]), [blocks]);

  const commit = (next: ScreenplayBlock[]) => {
    history.undo.push(blocks.map((block) => ({ ...block })));
    if (history.undo.length > 100) history.undo.shift();
    history.redo = [];
    history.blocks = next;
    onBlocksChange(next);
  };

  const undo = () => {
    if (readOnly) return;
    const previous = history.undo.pop();
    if (previous) {
      history.redo.push(blocks.map((item) => ({ ...item })));
      history.blocks = previous;
      onBlocksChange(previous);
    }
  };

  const redo = () => {
    if (readOnly) return;
    const next = history.redo.pop();
    if (next) {
      history.undo.push(blocks.map((item) => ({ ...item })));
      history.blocks = next;
      onBlocksChange(next);
    }
  };

  if (historyRef) historyRef.current = { undo, redo };

  useLayoutEffect(() => {
    setActiveId(null);
    pendingFocus.current = null;
    tabbedFromActionBlockId.current = null;
    tabCompletion.current = null;
  }, [documentId]);

  useLayoutEffect(() => {
    if (!tabbedFromActionBlockId.current) return;
    const block = blocks.find((item) => item.id === tabbedFromActionBlockId.current);
    if (!block || block.type !== "character" || block.text !== "") {
      tabbedFromActionBlockId.current = null;
    }
  }, [blocks]);

  useLayoutEffect(() => {
    if (!tabCompletion.current) return;
    const block = blocks.find((item) => item.id === tabCompletion.current?.blockId);
    if (!block || block.type !== "scene_heading" || block.text !== tabCompletion.current.renderedText) {
      tabCompletion.current = null;
    }
  }, [blocks]);

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
    commit(next);
  };

  const handleChange = (index: number, block: ScreenplayBlock, el: HTMLTextAreaElement) => {
    if (readOnly) return;
    if (tabbedFromActionBlockId.current === block.id) tabbedFromActionBlockId.current = null;
    if (tabCompletion.current?.blockId === block.id) tabCompletion.current = null;
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
    if (type === "scene_heading" || type === "character" || type === "transition") value = value.toUpperCase();

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

    if (e.key !== "Tab" && tabCompletion.current?.blockId === block.id) {
      tabCompletion.current = null;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }

    // Ctrl/Cmd+1..8 — set the element type directly.
    if ((e.ctrlKey || e.metaKey) && e.key >= "1" && e.key <= "8") {
      e.preventDefault();
      if (tabbedFromActionBlockId.current === block.id) tabbedFromActionBlockId.current = null;
      update(index, { type: ELEMENT_TYPES[Number(e.key) - 1] });
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      if (block.type === "scene_heading") {
        const current = tabCompletion.current;
        let completion = current && current.blockId === block.id && current.renderedText === block.text && current.candidates.length > 1
          ? current
          : null;
        if (!completion) {
          const available = sceneHeadingCompletion(blocks, block.id, block.text);
          if (!available || available.candidates.length === 0) return;
          completion = {
            blockId: block.id,
            ...available,
            index: e.shiftKey ? available.candidates.length - 1 : 0,
            renderedText: "",
          };
        } else {
          const direction = e.shiftKey ? -1 : 1;
          completion.index = (completion.index + direction + completion.candidates.length) % completion.candidates.length;
        }
        const text = completion.base + completion.candidates[completion.index];
        completion.renderedText = text;
        tabCompletion.current = completion;
        pendingFocus.current = { id: block.id, pos: text.length };
        update(index, { text });
        return;
      }
      if (block.type === "dialogue" && !e.shiftKey) {
        const text = `(${block.text})`;
        tabCompletion.current = null;
        pendingFocus.current = { id: block.id, pos: text.length - 1 };
        update(index, { type: "parenthetical", text });
        return;
      }
      const i = ELEMENT_TYPES.indexOf(block.type);
      const n = ELEMENT_TYPES.length;
      const type = ELEMENT_TYPES[(i + (e.shiftKey ? -1 : 1) + n) % n];
      tabbedFromActionBlockId.current = block.type === "action" && type === "character" && block.text === ""
        ? block.id
        : null;
      update(index, { type });
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (block.text === "" && block.type === "character" && tabbedFromActionBlockId.current === block.id) {
        tabbedFromActionBlockId.current = null;
        update(index, { type: "action" });
        return;
      }
      const next = blocks.slice();
      if (block.text === "") {
        // Repeated Enter on a new action line starts the next scene without stacking blanks.
        if (block.type === "action") {
          update(index, { type: "scene_heading" });
          return;
        }
        const to = block.type === "dialogue" ? typeAfterDialogueEnter(blocks, index) : enterCreates[block.type];
        if (to !== block.type) {
          update(index, { type: to });
          return;
        }
      }
      const before = block.text.slice(0, selectionStart);
      const after = block.text.slice(selectionEnd);
      // Splitting mid-text keeps the type; Enter at the end flows to the next element.
      const createdType = after
        ? block.type
        : block.type === "dialogue" ? typeAfterDialogueEnter(blocks, index) : enterCreates[block.type];
      const created = newBlock(createdType, after);
      next[index] = { ...block, text: before };
      next.splice(index + 1, 0, created);
      pendingFocus.current = { id: created.id, pos: 0 };
      commit(next);
      return;
    }

    if (e.key === "Backspace" && block.text === "" && block.type === "character" && tabbedFromActionBlockId.current === block.id) {
      e.preventDefault();
      tabbedFromActionBlockId.current = null;
      update(index, { type: "action" });
      return;
    }

    if (e.key === "Backspace" && collapsed && selectionStart === 0 && index > 0) {
      e.preventDefault();
      const prev = blocks[index - 1];
      const next = blocks.slice();
      next[index - 1] = { ...prev, text: prev.text + block.text };
      next.splice(index, 1);
      pendingFocus.current = { id: prev.id, pos: prev.text.length };
      commit(next);
      return;
    }

    if (e.key === "Delete" && collapsed && selectionStart === block.text.length && index < blocks.length - 1) {
      e.preventDefault();
      const after = blocks[index + 1];
      const next = blocks.slice();
      next[index] = { ...block, text: block.text + after.text };
      next.splice(index + 1, 1);
      pendingFocus.current = { id: block.id, pos: block.text.length };
      commit(next);
      return;
    }

    if (e.key === "ArrowUp" && index > 0 && !el.value.slice(0, selectionStart).includes("\n")) {
      e.preventDefault();
      const prev = blocks[index - 1];
      pendingFocus.current = { id: prev.id, pos: prev.text.length };
      const next = blocks.slice();
      history.blocks = next;
      onBlocksChange(next);
      return;
    }

    if (
      e.key === "ArrowDown" &&
      index < blocks.length - 1 &&
      !el.value.slice(selectionEnd).includes("\n")
    ) {
      e.preventDefault();
      pendingFocus.current = { id: blocks[index + 1].id, pos: 0 };
      const next = blocks.slice();
      history.blocks = next;
      onBlocksChange(next);
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
        <span className="title-card-hint">Title page</span>
      </div>

      {pages.map((page, pageIndex) => <div className="page page-surface" key={`page-${pageIndex}`} data-page={productionPages?.[pageIndex]?.label ?? pageIndex + 1} data-revision-color={productionPages?.[pageIndex]?.color ?? ""}>
        {page.map((block) => {
          const index = indexes.get(block.id)!;
          const completionNames = block.type === "character" ? characterNames : block.type === "scene_heading" ? [...new Set([...sceneHeadings, ...locationHeadings])] : [];
          const suggestions = activeId === block.id ? completionNames.filter((name) => name !== block.text && name.startsWith(block.text.trim().toUpperCase())).slice(0, 5) : [];
          return <Fragment key={block.id}>
          <textarea
            rows={1}
            spellCheck={false}
            className={`blk blk-${block.type}${block.textRuns?.some((run) => run.revisionId) ? " revised" : ""}`}
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
            onFocus={() => { setActiveId(block.id); onActiveBlock(block.id); }}
            onBlur={() => {
              if (tabbedFromActionBlockId.current === block.id) tabbedFromActionBlockId.current = null;
              if (tabCompletion.current?.blockId === block.id) tabCompletion.current = null;
            }}
            onChange={(e) => handleChange(index, block, e.currentTarget)}
            onKeyDown={(e) => handleKeyDown(e, index, block)}
          />
          {suggestions.length > 0 && <div className="character-suggestions">{suggestions.map((name) => <button key={name} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { update(index, { text: name }); refs.current.get(block.id)?.focus(); }}>{name}</button>)}</div>}
          </Fragment>;
        })}
      </div>)}
    </div>
  );
}
