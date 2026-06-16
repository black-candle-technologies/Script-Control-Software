import {
  featureHierarchy,
  televisionHierarchy,
  projectTypes,
  foundationSignals,
  workspacePanels,
  scsProjectLayout,
  statusLabels,
  type FoundationStatus,
  type HierarchyLevel,
} from "../domain/index.ts";

function StatusTag({ status }: { status: FoundationStatus }) {
  return <span className={`status-tag status-${status}`}>{statusLabels[status]}</span>;
}

function HierarchyColumn({ title, levels }: { title: string; levels: HierarchyLevel[] }) {
  return (
    <div className="hierarchy-col">
      <h3>{title}</h3>
      <ol className="ladder">
        {levels.map((level) => (
          <li key={level.id} className={level.scope === "shared" ? "" : "scoped"}>
            <span className="level-label">{level.label}</span>
            <span className="level-desc">{level.description}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Dashboard() {
  return (
    <>
      {/* Project types */}
      <section className="block">
        <div className="block-header">
          <h2>Start a project</h2>
          <span className="hint">Creating projects arrives in a later phase.</span>
        </div>
        <div className="card-grid project-grid">
          {projectTypes.map((type) => (
            <article key={type.id} className="card project-card">
              <span className="card-title">{type.name}</span>
              <span className="card-tagline">{type.tagline}</span>
              <span className="card-desc">{type.description}</span>
              <span className="card-flow">
                {type.hierarchy.map((l) => l.label).join(" → ")}
              </span>
            </article>
          ))}
        </div>
      </section>

      {/* Architecture / status */}
      <section className="block">
        <div className="block-header">
          <h2>Foundation status</h2>
          <span className="hint">What is real today versus drafted or planned.</span>
        </div>
        <div className="card-grid status-grid">
          {foundationSignals.map((signal) => (
            <div key={signal.id} className="card signal">
              <span className={`dot status-${signal.status}`} />
              <div className="signal-body">
                <div className="signal-top">
                  <span className="signal-label">{signal.label}</span>
                  <StatusTag status={signal.status} />
                </div>
                <span className="signal-detail">{signal.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Story hierarchy */}
      <section className="block">
        <div className="block-header">
          <h2>Story hierarchy</h2>
          <span className="hint">
            Acts, sequences, scenes and beats stay distinct — not a flat board.
          </span>
        </div>
        <div className="hierarchy-columns">
          <HierarchyColumn title="Feature Film" levels={featureHierarchy} />
          <HierarchyColumn title="Television Show" levels={televisionHierarchy} />
        </div>
      </section>

      {/* Workspace panels */}
      <section className="block">
        <div className="block-header">
          <h2>Workspace panels</h2>
          <span className="hint">Planned — placeholders for the multi-panel workspace.</span>
        </div>
        <div className="card-grid panel-grid">
          {workspacePanels.map((panel) => (
            <article key={panel.id} className="card panel-card">
              <span className="panel-title">{panel.title}</span>
              <span className="panel-summary">{panel.summary}</span>
              <StatusTag status={panel.status} />
            </article>
          ))}
        </div>
      </section>

      {/* Project format */}
      <section className="block">
        <div className="block-header">
          <h2>Project format</h2>
          <span className="hint">Portable .scs folder — see docs/PROJECT_FORMAT.md.</span>
        </div>
        <div className="format-block">
          {scsProjectLayout.map((entry) => (
            <div key={entry.path} className="format-row">
              <span className="format-path">{entry.path}</span>
              <span className="format-note">{entry.note}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
