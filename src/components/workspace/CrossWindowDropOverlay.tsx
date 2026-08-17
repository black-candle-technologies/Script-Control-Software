import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { InternalDragPlacement, InternalDragSession } from "../../services/nativeWorkspaceService.ts";
import { nativeDropPlacementOptions, sameNativeDropPlacement } from "./crossWindowDropOverlayModel.ts";

export interface CrossWindowDropOverlayProps {
  active: InternalDragSession;
  windowId: string;
  title: string;
  documentTabCount: number;
  dockGroupIds: readonly string[];
  onPreview: (placement: InternalDragPlacement) => Promise<unknown>;
  onAcknowledge: () => Promise<unknown>;
  onCancel: () => Promise<unknown>;
}

/** Native coordinator-backed destination chooser; no project content crosses the drag boundary. */
export function CrossWindowDropOverlay({ active, windowId, title, documentTabCount, dockGroupIds, onPreview, onAcknowledge, onCancel }: CrossWindowDropOverlayProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const committing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const source = active.sourceWindowId === windowId;
  useEffect(() => {
    setError(undefined);
    if (source) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let frame: number | undefined;
    const focusFirstPlacement = () => {
      if (!document.hasFocus()) return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    };
    focusFirstPlacement();
    window.addEventListener("focus", focusFirstPlacement);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener("focus", focusFirstPlacement);
      if (document.hasFocus() && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [active.dragId, source]);

  const cancel = async () => {
    if (committing.current) return;
    committing.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await onCancel();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      committing.current = false;
      setBusy(false);
    }
  };
  if (active.sourceWindowId === windowId) {
    return <div className="cross-window-source-preview"><span role="status">{active.effect === "copy" ? "Copying" : "Moving"} {title} — choose a destination window.</span><button type="button" disabled={busy} onClick={() => void cancel()}>Cancel</button>{error ? <span role="alert">{error}</span> : null}</div>;
  }
  const placements = nativeDropPlacementOptions(active.payload, documentTabCount, dockGroupIds);
  const preview = (placement: InternalDragPlacement) => {
    if (committing.current) return;
    void onPreview(placement).catch((cause) => setError(errorMessage(cause)));
  };
  const choose = async (placement: InternalDragPlacement) => {
    if (committing.current) return;
    committing.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await onPreview(placement);
      await onAcknowledge();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      committing.current = false;
      setBusy(false);
    }
  };
  return (
    <div ref={dialog} className="cross-window-drop-overlay" role="dialog" aria-modal="true" aria-busy={busy} aria-label={`Place ${title}`} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); void cancel(); return; }
      trapDialogFocus(event, dialog.current);
    }}>
      <p>{active.effect === "copy" ? "Copy" : "Move"} {title} into this window</p>
      <div className="cross-window-drop-zones">
        {placements.map((placement) => {
          const selected = active.target?.windowId === windowId && sameNativeDropPlacement(active.target.placement, placement.value);
          return <button key={placement.key} type="button" disabled={busy} className={selected ? "active" : ""} onPointerEnter={() => preview(placement.value)} onFocus={() => preview(placement.value)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = active.effect; }} onDrop={(event) => { event.preventDefault(); void choose(placement.value); }} onClick={() => void choose(placement.value)}>{placement.label}</button>;
        })}
      </div>
      <button type="button" disabled={busy} onClick={() => void cancel()}>Cancel transfer</button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>, root: HTMLDivElement | null) {
  if (event.key !== "Tab" || !root) return;
  const controls = [...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if (!controls.length) return;
  const current = controls.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.shiftKey
    ? current <= 0 ? controls.length - 1 : current - 1
    : current < 0 || current === controls.length - 1 ? 0 : current + 1;
  event.preventDefault();
  controls[next]?.focus();
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
