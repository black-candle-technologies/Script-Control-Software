import type { ScreenplayDocument } from "../domain/index.ts";
import type { FdxFileInfo } from "../services/fdxService.ts";

interface CompanionDashboardProps {
  documents: ScreenplayDocument[];
  files: FdxFileInfo[];
  folderPath: string;
  recursive: boolean;
  busy: boolean;
  stats: { scenes: number; characters: number; objects: number; treatments: number; versions: number; continuity: number };
  onChooseFolder: () => void;
  onRefresh: () => void;
  onRecursive: (recursive: boolean) => void;
  onReviewFile: (file: FdxFileInfo) => void;
  onOpenFile: (path: string) => void;
  onReveal: (path: string) => void;
}

export default function CompanionDashboard({ documents, files, folderPath, recursive, busy, stats, onChooseFolder, onRefresh, onRecursive, onReviewFile, onOpenFile, onReveal }: CompanionDashboardProps) {
  const linkedByPath = new Map(documents.flatMap((document) => document.source?.type === "fdx" && document.source.path ? [[document.source.path, document] as const] : []));
  return <main className="companion-dashboard">
    <header className="companion-header">
      <div><span className="insp-kicker">Final Draft companion</span><h2>Development dashboard</h2><p>Keep writing in your FDX editor while SCS watches scripts and maintains the project database.</p></div>
      <div className="btn-row"><button className="btn btn-primary" disabled={busy} onClick={onChooseFolder}>{folderPath ? "Change watch folder" : "Choose watch folder"}</button><button className="btn" disabled={busy || !folderPath} onClick={onRefresh}>Refresh</button><button className="btn btn-ghost" disabled={!folderPath} onClick={() => onReveal(folderPath)}>Reveal folder</button></div>
    </header>

    <section className="companion-stats" aria-label="Development database summary">
      {Object.entries(stats).map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </section>

    <section className="companion-watch">
      <div className="companion-section-heading"><div><h3>Watched Final Draft files</h3><p>{folderPath || "Choose a folder containing .fdx files to begin."}</p></div><label><input type="checkbox" checked={recursive} onChange={(event) => onRecursive(event.target.checked)} /> Include subfolders</label></div>
      {!folderPath ? <div className="companion-empty">SCS only reads files you explicitly link. Script changes are never written back automatically.</div> : !files.length ? <div className="companion-empty">No .fdx files were found in this folder.</div> : <div className="companion-file-list">
        {files.map((file) => {
          const linked = linkedByPath.get(file.path);
          const changed = Boolean(linked?.source?.lastImportedModifiedAt && linked.source.lastImportedModifiedAt !== file.modifiedAt);
          return <article key={file.path} className={`companion-file ${changed ? "changed" : ""}`}>
            <div><strong>{file.fileName}</strong><span>{linked ? changed ? "Changed outside SCS" : "Linked and current" : "Available to link"} · {formatBytes(file.size)}</span></div>
            <div className="btn-row"><button className="btn btn-primary" onClick={() => onReviewFile(file)}>{linked ? changed ? "Review change" : "Re-import" : "Link script"}</button><button className="btn" onClick={() => onOpenFile(file.path)}>Open externally</button><button className="btn btn-ghost" onClick={() => onReveal(file.path)}>Reveal</button></div>
          </article>;
        })}
      </div>}
    </section>

    <section className="companion-workflow">
      <h3>Safe handoff</h3>
      <ol><li>Open the linked FDX in Final Draft or your preferred editor.</li><li>SCS detects timestamp changes every five seconds, including after restart.</li><li>Review and re-import; SCS keeps treatments, boards, sheets, versions, revisions, and continuity.</li><li>If both copies changed, choose the script text to keep after SCS creates a recovery version.</li></ol>
    </section>
  </main>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
