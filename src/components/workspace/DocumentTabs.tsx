import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  activateDocumentTab,
  closeDocumentTab,
  openDocumentTab,
  reorderDocumentTab,
  type DocumentTabState,
} from "../../domain/documentTabs.ts";
import type { ScreenplayDocument } from "../../domain/screenplay.ts";

export interface DocumentTabsProps {
  documents: readonly ScreenplayDocument[];
  state: DocumentTabState;
  onChange: (state: DocumentTabState) => void;
  onRequestRemove?: (documentId: string) => void;
  onBeginExternalDrag?: (documentId: string, event: DragEvent) => void;
  onEndExternalDrag?: (documentId: string, event: DragEvent) => void;
  onInternalDrop?: (documentId: string, index: number, event: DragEvent) => void;
  statusByDocumentId?: Readonly<Record<string, "saved" | "dirty" | "saving" | "conflict">>;
  readOnly?: boolean;
}

export function DocumentTabs({ documents, state, onChange, onRequestRemove, onBeginExternalDrag, onEndExternalDrag, onInternalDrop, statusByDocumentId = {}, readOnly = false }: DocumentTabsProps) {
  const [menuDocumentId, setMenuDocumentId] = useState<string>();
  const tablistRef = useRef<HTMLDivElement>(null);
  const byId = new Map(documents.flatMap((document) => document.id ? [[document.id, document] as const] : []));
  const closed = documents.filter((document) => document.id && !state.openDocumentIds.includes(document.id));
  const focusTab = (index: number) => requestAnimationFrame(() => tablistRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus());
  return (
    <div className="document-tabs-shell">
      <div ref={tablistRef} className="document-tabs" role="tablist" aria-label="Open screenplays">
        {state.openDocumentIds.map((documentId, index) => {
          const document = byId.get(documentId);
          if (!document) return null;
          const title = documentTitle(document);
          const selected = state.activeDocumentId === documentId;
          const status = statusByDocumentId[documentId] ?? "saved";
          return (
            <span key={documentId} className="document-tab-wrap">
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className="document-tab"
                draggable
                onClick={() => onChange(activateDocumentTab(state, documentId))}
                onKeyDown={(event) => onTabKeyDown(event, state, documentId, index, onChange, focusTab)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-scs-document-tab", documentId);
                  event.dataTransfer.effectAllowed = "move";
                  onBeginExternalDrag?.(documentId, event);
                }}
                onDragEnd={(event) => onEndExternalDrag?.(documentId, event)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData("application/x-scs-document-tab");
                  if (source) {
                    onInternalDrop?.(source, index, event);
                    onChange(reorderDocumentTab(state, source, index));
                  }
                }}
              >
                <span>{title}</span>
                {document.source?.type === "fdx" ? <span className="document-tab-badge" aria-label="Linked Final Draft screenplay">FDX</span> : null}
                {document.readOnly ? <span className="document-tab-badge" aria-label="Read-only screenplay">Read-only</span> : null}
                <span className={`document-status document-status-${status}`} aria-label={status}>{status === "saved" ? "" : "•"}</span>
              </button>
              <button type="button" className="document-tab-menu-button" aria-label={`Actions for ${title}`} aria-haspopup="menu" aria-expanded={menuDocumentId === documentId} onClick={() => setMenuDocumentId(menuDocumentId === documentId ? undefined : documentId)}>•••</button>
              {menuDocumentId === documentId ? (
                <div className="document-tab-menu" role="menu">
                  <button type="button" role="menuitem" disabled={state.openDocumentIds.length <= 1} title={state.openDocumentIds.length <= 1 ? "Keep one screenplay open in this window" : undefined} onClick={() => { onChange(closeDocumentTab(state, documentId)); setMenuDocumentId(undefined); }}>Close view</button>
                  <button type="button" role="menuitem" disabled={readOnly || !onRequestRemove} onClick={() => { onRequestRemove?.(documentId); setMenuDocumentId(undefined); }}>Remove from project…</button>
                </div>
              ) : null}
            </span>
          );
        })}
      </div>
      {closed.length ? (
        <label className="document-open-picker">Open screenplay
          <select aria-label="Open screenplay" value="" onChange={(event) => event.target.value && onChange(openDocumentTab(state, event.target.value))}>
            <option value="">Choose…</option>
            {closed.map((document) => <option key={document.id} value={document.id}>{documentTitle(document)}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function onTabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  state: DocumentTabState,
  documentId: string,
  index: number,
  onChange: (state: DocumentTabState) => void,
  focus: (index: number) => void,
) {
  if (event.altKey && event.shiftKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const target = Math.max(0, Math.min(index + (event.key === "ArrowLeft" ? -1 : 1), state.openDocumentIds.length - 1));
    onChange(reorderDocumentTab(state, documentId, target));
    focus(target);
    return;
  }
  if (event.key === "Delete" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (state.openDocumentIds.length <= 1) return;
    onChange(closeDocumentTab(state, documentId));
    focus(Math.min(index, state.openDocumentIds.length - 2));
    return;
  }
  const next = event.key === "ArrowRight" ? (index + 1) % state.openDocumentIds.length
    : event.key === "ArrowLeft" ? (index - 1 + state.openDocumentIds.length) % state.openDocumentIds.length
      : event.key === "Home" ? 0 : event.key === "End" ? state.openDocumentIds.length - 1 : -1;
  if (next >= 0) {
    event.preventDefault();
    onChange(activateDocumentTab(state, state.openDocumentIds[next]));
    focus(next);
  }
}

function documentTitle(document: ScreenplayDocument): string {
  return document.title?.trim() || document.titlePage.title.trim() || "Untitled screenplay";
}
