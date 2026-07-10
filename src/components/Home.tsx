import type { AppInfo } from "../domain/index.ts";

export type DocChoice = "saved" | "sample" | "new";

interface HomeProps {
  appInfo: AppInfo;
  savedTitle: string | null;
  onOpen: (choice: DocChoice) => void;
  onOpenFdx: () => void;
  importError: string | null;
  importing: boolean;
  onShowFoundation: () => void;
}

export default function Home({ appInfo, savedTitle, onOpen, onOpenFdx, importError, importing, onShowFoundation }: HomeProps) {
  return (
    <div className="home">
      <div className="home-hero">
        <h1>{appInfo.name}</h1>
        <span className="home-sub">SCS</span>
        <p className="home-tagline">{appInfo.tagline}</p>
      </div>

      <div className="home-actions">
        <button className="home-action primary" onClick={onOpenFdx} disabled={importing}>
          <span className="home-action-title">{importing ? "Opening…" : "Open FDX"}</span>
          <span className="home-action-desc">Import a local Final Draft screenplay read-only.</span>
        </button>
        <button className="home-action primary" onClick={() => onOpen("new")}>
          <span className="home-action-title">New Screenplay</span>
          <span className="home-action-desc">A blank page, starting from a scene heading.</span>
        </button>
        <button className="home-action" onClick={() => onOpen("sample")}>
          <span className="home-action-title">Sample Project</span>
          <span className="home-action-desc">“The Long Way Home” — a short sample script.</span>
        </button>
        <button className="home-action" disabled title="Planned — project files arrive with the storage layer">
          <span className="home-action-title">
            Open Project <span className="planned-tag">planned</span>
          </span>
          <span className="home-action-desc">Open a portable .scs project folder.</span>
        </button>
      </div>

      {importError && <div className="import-error" role="alert">{importError}</div>}

      <div className="home-recent">
        <h2>Recent</h2>
        {savedTitle ? (
          <button className="home-recent-item" onClick={() => onOpen("saved")}>
            <span className="home-recent-title">{savedTitle}</span>
            <span className="home-recent-meta">Saved locally in this app — continue writing</span>
          </button>
        ) : (
          <p className="home-recent-empty">Nothing yet. Your work autosaves locally as you write.</p>
        )}
      </div>

      <div className="home-foot">
        <span>
          {appInfo.short_name} v{appInfo.version} · {appInfo.phase}
        </span>
        <button className="link-btn" onClick={onShowFoundation}>
          Foundation status
        </button>
      </div>
    </div>
  );
}
