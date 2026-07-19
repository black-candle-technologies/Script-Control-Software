/**
 * SCS project launcher — a restrained start surface. One brand column, one
 * action list, straight into the screenplay. The launcher is deliberately not
 * a dashboard: opening a project is the whole job.
 */
import type { AppInfo } from "../domain/index.ts";
import Icon from "./Icons.tsx";

export type DocChoice = "saved" | "sample" | "new" | "new-show";

interface LauncherProps {
  appInfo: AppInfo;
  savedTitle: string | null;
  onOpen: (choice: DocChoice) => void;
  onOpenFdx: () => void;
  onOpenProject: () => void;
  importError: string | null;
  importing: boolean;
}

export default function Launcher({ appInfo, savedTitle, onOpen, onOpenFdx, onOpenProject, importError, importing }: LauncherProps) {
  return (
    <div className="launcher">
      <aside className="launcher-brand">
        <div className="launcher-mark" aria-hidden="true">SCS</div>
        <h1>{appInfo.name}</h1>
        <p>{appInfo.tagline}</p>
        <span className="launcher-version">v{appInfo.version} · {appInfo.phase}</span>
      </aside>

      <main className="launcher-panel">
        <section className="launcher-section" aria-label="Start">
          <h2>Start</h2>
          <div className="launcher-actions">
            <button className="launcher-action" onClick={() => onOpen("new")}>
              <Icon name="write" />
              <span className="launcher-action-text">
                <strong>New Feature Screenplay</strong>
                <span>A blank page, starting from a scene heading.</span>
              </span>
            </button>
            <button className="launcher-action" onClick={() => onOpen("new-show")}>
              <Icon name="series" />
              <span className="launcher-action-text">
                <strong>New Television Project</strong>
                <span>Episode tabs sharing one show bible and season arc.</span>
              </span>
            </button>
            <button className="launcher-action" onClick={onOpenProject} disabled={importing}>
              <Icon name="treatment" />
              <span className="launcher-action-text">
                <strong>Open SCS Project</strong>
                <span>Open a portable scs.project.json folder.</span>
              </span>
            </button>
            <button className="launcher-action" onClick={onOpenFdx} disabled={importing}>
              <Icon name="companion" />
              <span className="launcher-action-text">
                <strong>{importing ? "Importing…" : "Import Final Draft (FDX)"}</strong>
                <span>Bring in an .fdx script and keep it linked.</span>
              </span>
            </button>
          </div>
        </section>

        {importError && <div className="launcher-error" role="alert">{importError}</div>}

        <section className="launcher-section" aria-label="Recent projects">
          <h2>Recent</h2>
          {savedTitle ? (
            <button className="launcher-recent" onClick={() => onOpen("saved")}>
              <span className="launcher-recent-title">{savedTitle}</span>
              <span className="launcher-recent-meta">Continue writing — autosaved locally</span>
              <Icon name="chevron-right" size={14} />
            </button>
          ) : (
            <p className="launcher-recent-empty">Nothing yet. Work autosaves locally as you write.</p>
          )}
        </section>

        <section className="launcher-section" aria-label="Sample">
          <button className="launcher-sample" onClick={() => onOpen("sample")}>
            Open the sample project — <em>“The Long Way Home”</em>
          </button>
        </section>
      </main>
    </div>
  );
}
