import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "./Editor.tsx";
import Inspector, { type DraftVersion } from "./Inspector.tsx";
import {
  ELEMENT_TYPES,
  deriveCharacters,
  deriveLocations,
  deriveScenes,
  countWords,
  elementLabels,
  estimatePages,
  parseFountain,
  toFountain,
  type ScreenplayDocument,
  type ScreenplayElementType,
} from "../domain/index.ts";
import { sampleVersions } from "../domain/sample.ts";
import { saveDocument } from "../storage.ts";

interface WorkspaceProps {
  initialDoc: ScreenplayDocument;
}

export default function Workspace({ initialDoc }: WorkspaceProps) {
  const [doc, setDoc] = useState(initialDoc);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mode, setMode] = useState<"formatted" | "source">("formatted");
  const [sourceText, setSourceText] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [versions, setVersions] = useState<DraftVersion[]>(sampleVersions);
  const focusNonce = useRef(0);

  // Debounced autosave to localStorage.
  useEffect(() => {
    const t = setTimeout(() => {
      saveDocument(doc);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 800);
    return () => clearTimeout(t);
  }, [doc]);

  const scenes = useMemo(() => deriveScenes(doc.blocks), [doc.blocks]);
  const characters = useMemo(() => deriveCharacters(doc.blocks), [doc.blocks]);
  const locations = useMemo(() => deriveLocations(doc.blocks), [doc.blocks]);
  const words = useMemo(() => countWords(doc.blocks), [doc.blocks]);
  const pages = useMemo(() => estimatePages(doc.blocks), [doc.blocks]);

  const activeIndex = doc.blocks.findIndex((b) => b.id === activeBlockId);
  const activeBlock = activeIndex >= 0 ? doc.blocks[activeIndex] : null;
  const activeScene =
    activeIndex >= 0
      ? [...scenes].reverse().find((s) => s.blockIndex <= activeIndex) ?? null
      : scenes[0] ?? null;

  const setActiveType = (type: ScreenplayElementType) => {
    if (!activeBlock) return;
    const blocks = doc.blocks.slice();
    blocks[activeIndex] = { ...activeBlock, type };
    setDoc({ ...doc, blocks });
    setFocusRequest({ id: activeBlock.id, nonce: ++focusNonce.current });
  };

  const jumpToScene = (blockId: string) => {
    setFocusRequest({ id: blockId, nonce: ++focusNonce.current });
  };

  const toggleMode = () => {
    if (mode === "formatted") {
      setSourceText(toFountain(doc));
      setMode("source");
    } else {
      const parsed = parseFountain(sourceText);
      // Scene notes are keyed by heading block id; re-key them by scene order
      // since parsing regenerates ids.
      const oldScenes = scenes;
      const newScenes = deriveScenes(parsed.blocks);
      const sceneNotes: Record<string, string> = {};
      for (const [id, note] of Object.entries(doc.sceneNotes)) {
        const oldScene = oldScenes.find((s) => s.id === id);
        const match = oldScene && newScenes[oldScene.number - 1];
        if (match && note) sceneNotes[match.id] = note;
      }
      setDoc({ ...parsed, sceneNotes });
      setMode("formatted");
    }
  };

  const saveNow = () => {
    saveDocument(doc);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const exportFountain = () => {
    const blob = new Blob([toFountain(doc)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(doc.titlePage.title || "screenplay").toLowerCase().replace(/\s+/g, "-")}.fountain`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveDraftVersion = () => {
    setVersions((v) => [
      {
        id: `s${Date.now()}`,
        label: `Session draft ${v.filter((x) => x.id.startsWith("s")).length + 1}`,
        note: "Saved from the Drafts panel (session only).",
        when: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        milestone: false,
      },
      ...v,
    ]);
  };

  return (
    <div className="workspace">
      {/* ---- Toolbar ---- */}
      <div className="toolbar">
        <select
          className="element-select"
          value={activeBlock?.type ?? "action"}
          disabled={!activeBlock || mode === "source"}
          onChange={(e) => setActiveType(e.target.value as ScreenplayElementType)}
          title="Current element (Tab cycles, Ctrl+1–8 sets directly)"
        >
          {ELEMENT_TYPES.map((t, i) => (
            <option key={t} value={t}>
              {elementLabels[t]} — Ctrl+{i + 1}
            </option>
          ))}
        </select>

        <div className="mode-toggle">
          <button className={mode === "formatted" ? "active" : ""} onClick={() => mode === "source" && toggleMode()}>
            Formatted
          </button>
          <button className={mode === "source" ? "active" : ""} onClick={() => mode === "formatted" && toggleMode()}>
            Fountain Source
          </button>
        </div>

        <div className="toolbar-spacer" />

        <button className="btn" onClick={saveNow}>
          Save Project
        </button>
        <button className="btn" onClick={exportFountain}>
          Export Fountain
        </button>
        <button className="btn btn-ghost" disabled title="Planned — not implemented yet">
          Import FDX <span className="planned-tag">planned</span>
        </button>
        <button className="btn btn-ghost" disabled title="Planned — not implemented yet">
          Export FDX <span className="planned-tag">planned</span>
        </button>
        <button className="btn btn-ghost" disabled title="Planned — not implemented yet">
          Export PDF <span className="planned-tag">planned</span>
        </button>
        <button
          className="btn"
          onClick={() => setInspectorOpen((o) => !o)}
          title={inspectorOpen ? "Hide inspector" : "Show inspector"}
        >
          {inspectorOpen ? "Panel ▸" : "◂ Panel"}
        </button>
      </div>

      {/* ---- Main area ---- */}
      <div className="workspace-main">
        <aside className="scene-nav">
          <div className="nav-doc-title">{doc.titlePage.title || "Untitled Screenplay"}</div>
          <div className="nav-group">
            <span className="nav-act">ACT I</span>
            <span className="nav-structure-hint">structure grouping planned</span>
          </div>
          <div className="nav-sequence">Sequence 1</div>
          <ol className="nav-scenes">
            {scenes.map((s) => (
              <li key={s.id}>
                <button
                  className={`nav-scene ${activeScene?.id === s.id ? "active" : ""}`}
                  onClick={() => jumpToScene(s.id)}
                >
                  <span className="nav-scene-num">{s.number}</span>
                  <span className="nav-scene-heading">{s.heading}</span>
                </button>
                {activeScene?.id === s.id && (
                  <div className="nav-beats">Beats — beat board planned</div>
                )}
              </li>
            ))}
            {!scenes.length && <li className="nav-empty">No scenes yet — start with INT. or EXT.</li>}
          </ol>
          <div className="nav-foot">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"} · ~{pages} page{pages === 1 ? "" : "s"}
          </div>
        </aside>

        {mode === "formatted" ? (
          <Editor
            blocks={doc.blocks}
            onBlocksChange={(blocks) => setDoc({ ...doc, blocks })}
            titlePage={doc.titlePage}
            onTitlePageChange={(titlePage) => setDoc({ ...doc, titlePage })}
            onActiveBlock={setActiveBlockId}
            focusRequest={focusRequest}
          />
        ) : (
          <div className="source-wrap">
            <textarea
              className="source-editor"
              value={sourceText}
              spellCheck={false}
              onChange={(e) => setSourceText(e.target.value)}
            />
            <p className="source-hint">
              Fountain-inspired source. Switching back to Formatted re-parses this text — see
              docs/EDITOR.md for the exact rules.
            </p>
          </div>
        )}

        {inspectorOpen && (
          <Inspector
            blocks={doc.blocks}
            scenes={scenes}
            characters={characters}
            locations={locations}
            activeScene={activeScene}
            sceneNotes={doc.sceneNotes}
            onSceneNote={(sceneId, text) =>
              setDoc({ ...doc, sceneNotes: { ...doc.sceneNotes, [sceneId]: text } })
            }
            versions={versions}
            onSaveVersion={saveDraftVersion}
            words={words}
            pages={pages}
          />
        )}
      </div>

      {/* ---- Status bar ---- */}
      <div className="statusbar">
        <span className="status-element">
          {activeBlock ? elementLabels[activeBlock.type] : "—"}
        </span>
        <span>
          {scenes.length} scene{scenes.length === 1 ? "" : "s"}
        </span>
        <span>~{pages} pages</span>
        <span>{words} words</span>
        <div className="toolbar-spacer" />
        <span>{savedAt ? `Saved locally · ${savedAt}` : "Not saved yet"}</span>
        <span className="status-draft">Draft: current · drafts panel →</span>
      </div>
    </div>
  );
}
