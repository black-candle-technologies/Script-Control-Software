import { useState } from "react";
import {
  parseHeading,
  type CharacterRef,
  type LocationRef,
  type Scene,
  type ScreenplayBlock,
} from "../domain/index.ts";
import { sampleCharacterBios, sampleEpisodes, sampleProps } from "../domain/sample.ts";

export interface DraftVersion {
  id: string;
  label: string;
  note: string;
  when: string;
  milestone: boolean;
}

interface InspectorProps {
  blocks: ScreenplayBlock[];
  scenes: Scene[];
  characters: CharacterRef[];
  locations: LocationRef[];
  activeScene: Scene | null;
  sceneNotes: Record<string, string>;
  onSceneNote: (sceneId: string, text: string) => void;
  versions: DraftVersion[];
  onSaveVersion: () => void;
  words: number;
  pages: number;
}

const TABS = ["Scene", "Cast", "Props", "Places", "Drafts", "Breakdown", "Series", "Entities"] as const;
type Tab = (typeof TABS)[number];

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="insp-hint">{children}</p>;
}

function Planned({ label }: { label: string }) {
  return (
    <button className="btn btn-ghost" disabled title="Planned — not implemented yet">
      {label} <span className="planned-tag">planned</span>
    </button>
  );
}

export default function Inspector(props: InspectorProps) {
  const [tab, setTab] = useState<Tab>("Scene");

  return (
    <aside className="inspector">
      <nav className="insp-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`insp-tab ${t === tab ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="insp-body">
        {tab === "Scene" && <SceneTab {...props} />}
        {tab === "Cast" && <CastTab {...props} />}
        {tab === "Props" && <PropsTab />}
        {tab === "Places" && <PlacesTab {...props} />}
        {tab === "Drafts" && <DraftsTab {...props} />}
        {tab === "Breakdown" && <BreakdownTab {...props} />}
        {tab === "Series" && <SeriesTab {...props} />}
        {tab === "Entities" && <EntitiesTab {...props} />}
      </div>
    </aside>
  );
}

/* ---- Scene -------------------------------------------------------------- */

function SceneTab({ blocks, scenes, activeScene, sceneNotes, onSceneNote }: InspectorProps) {
  if (!activeScene) {
    return <Hint>Click into the script to see the current scene here.</Hint>;
  }
  const { intExt, location, timeOfDay } = parseHeading(activeScene.heading);
  const nextHeading = scenes.find((s) => s.number === activeScene.number + 1);
  const end = nextHeading ? nextHeading.blockIndex : blocks.length;
  const scriptNotes = blocks
    .slice(activeScene.blockIndex, end)
    .filter((b) => b.type === "note" && b.text.trim());

  return (
    <div className="insp-stack">
      <div className="insp-kicker">Scene {activeScene.number}</div>
      <div className="insp-title">{activeScene.heading}</div>
      <dl className="insp-facts">
        {intExt && (
          <>
            <dt>Set</dt>
            <dd>{intExt}</dd>
          </>
        )}
        {location && (
          <>
            <dt>Location</dt>
            <dd>{location}</dd>
          </>
        )}
        {timeOfDay && (
          <>
            <dt>Time</dt>
            <dd>{timeOfDay}</dd>
          </>
        )}
        <dt>Cast</dt>
        <dd>{activeScene.characters.join(", ") || "—"}</dd>
      </dl>

      <h4>Beats</h4>
      {scriptNotes.length ? (
        <ul className="insp-list">
          {scriptNotes.map((n) => (
            <li key={n.id} className="insp-note">
              {n.text}
            </li>
          ))}
        </ul>
      ) : (
        <Hint>No notes in this scene. Add a Note element in the script.</Hint>
      )}
      <Hint>Structured beat board and treatment links are planned.</Hint>

      <h4>Scene notes</h4>
      <textarea
        className="insp-notes-input"
        placeholder="Private notes for this scene…"
        value={sceneNotes[activeScene.id] ?? ""}
        onChange={(e) => onSceneNote(activeScene.id, e.target.value)}
      />
    </div>
  );
}

/* ---- Cast ---------------------------------------------------------------- */

function CastTab({ characters }: InspectorProps) {
  if (!characters.length) return <Hint>No character cues in the script yet.</Hint>;
  return (
    <div className="insp-stack">
      <Hint>Detected live from character cues in the script.</Hint>
      {characters.map((c) => (
        <div key={c.name} className="insp-card">
          <div className="insp-card-title">{c.name}</div>
          <div className="insp-card-meta">
            {c.cueCount} cue{c.cueCount === 1 ? "" : "s"} · first appears in Sc. {c.firstScene}
          </div>
          <div className="insp-card-desc">
            {sampleCharacterBios[c.name] ?? "No description yet."}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Props ---------------------------------------------------------------- */

function PropsTab() {
  return (
    <div className="insp-stack">
      <Hint>Sample data — prop recognition from the script is planned.</Hint>
      {sampleProps.map((p) => (
        <div key={p.name} className="insp-card">
          <div className="insp-card-title">{p.name}</div>
          <div className="insp-card-meta">First appears in Sc. {p.firstScene}</div>
          <div className="insp-card-desc">{p.description}</div>
          {p.continuity && <div className="insp-card-continuity">Continuity: {p.continuity}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---- Places ---------------------------------------------------------------- */

function PlacesTab({ locations }: InspectorProps) {
  if (!locations.length) return <Hint>No scene headings yet.</Hint>;
  return (
    <div className="insp-stack">
      <Hint>Detected live from scene headings.</Hint>
      {locations.map((l) => (
        <div key={l.name} className="insp-card">
          <div className="insp-card-title">{l.name}</div>
          <div className="insp-card-meta">
            {l.intExt.join(" / ") || "—"} · scene{l.sceneNumbers.length === 1 ? "" : "s"}{" "}
            {l.sceneNumbers.join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Drafts ---------------------------------------------------------------- */

function DraftsTab({ versions, onSaveVersion }: InspectorProps) {
  return (
    <div className="insp-stack">
      <button className="btn btn-primary" onClick={onSaveVersion}>
        Save Draft Version
      </button>
      <Hint>Draft versions are session-only for now — real version control is planned.</Hint>
      <div className="version-list">
        {versions.map((v) => (
          <div key={v.id} className="version-row">
            <div className="version-top">
              <span className="version-label">{v.label}</span>
              {v.milestone && <span className="milestone-tag">milestone</span>}
              <span className="version-when">{v.when}</span>
            </div>
            <div className="version-note">{v.note}</div>
          </div>
        ))}
      </div>
      <h4>Changed scenes</h4>
      <Hint>Scene-aware draft comparison is planned.</Hint>
      <div className="btn-row">
        <Planned label="Compare Drafts" />
        <Planned label="Alternate Draft" />
        <Planned label="Restore" />
      </div>
    </div>
  );
}

/* ---- Breakdown ---------------------------------------------------------------- */

function BreakdownTab({ scenes, characters, locations, words, pages }: InspectorProps) {
  const intCount = scenes.filter((s) => parseHeading(s.heading).intExt.startsWith("INT")).length;
  const extCount = scenes.filter((s) => parseHeading(s.heading).intExt.startsWith("EXT")).length;
  const times = new Map<string, number>();
  for (const s of scenes) {
    const t = parseHeading(s.heading).timeOfDay;
    if (t) times.set(t, (times.get(t) ?? 0) + 1);
  }
  const live: [string, string][] = [
    ["Scenes", String(scenes.length)],
    ["Characters", String(characters.length)],
    ["Locations", String(locations.length)],
    ["INT / EXT", `${intCount} / ${extCount}`],
    ["Time of day", [...times.entries()].map(([t, n]) => `${t} ×${n}`).join(", ") || "—"],
    ["Words", String(words)],
    ["Pages", `~${pages}`],
  ];
  const sample: [string, string][] = [
    ["Props", String(sampleProps.length)],
    ["Vehicles", "1 (bus)"],
    ["Stunts", "0"],
    ["VFX / SFX", "0"],
    ["Wardrobe", "2 changes"],
  ];
  return (
    <div className="insp-stack">
      <h4>From the script (live)</h4>
      <dl className="insp-facts">
        {live.map(([k, v]) => (
          <div className="fact-row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h4>Sample categories</h4>
      <Hint>Sample data — script-driven breakdowns are planned.</Hint>
      <dl className="insp-facts">
        {sample.map(([k, v]) => (
          <div className="fact-row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---- Series (TV placeholder) ------------------------------------------------ */

function SeriesTab({ characters }: InspectorProps) {
  const [episode, setEpisode] = useState(0);
  return (
    <div className="insp-stack">
      <Hint>Television workspace preview — flip through episodes like tabs.</Hint>
      <div className="episode-tabs">
        {sampleEpisodes.map((ep, i) => (
          <button
            key={ep}
            className={`episode-tab ${i === episode ? "active" : ""}`}
            onClick={() => setEpisode(i)}
          >
            {ep}
          </button>
        ))}
      </div>
      {episode === 0 ? (
        <Hint>The Pilot is the screenplay currently open in the editor.</Hint>
      ) : (
        <Hint>
          {sampleEpisodes[episode]} — episode workspaces are planned. Each episode will carry its
          own script, beat board and breakdowns.
        </Hint>
      )}
      <h4>Show bible</h4>
      <Hint>Shared world, tone and canon notes — planned.</Hint>
      <h4>Continuity notes</h4>
      <Hint>Cross-episode continuity tracking — planned.</Hint>
      <h4>Recurring characters</h4>
      {characters.length ? (
        <div className="chip-row">
          {characters.map((c) => (
            <span key={c.name} className="chip">
              {c.name}
            </span>
          ))}
        </div>
      ) : (
        <Hint>None detected yet.</Hint>
      )}
      <h4>Recurring props</h4>
      <div className="chip-row">
        {sampleProps.map((p) => (
          <span key={p.name} className="chip">
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---- Entities (recognition placeholder) -------------------------------------- */

function EntitiesTab({ characters, locations }: InspectorProps) {
  const candidates = [
    ...characters.map((c) => ({ kind: "character", text: c.name, confidence: 0.95 })),
    ...locations.map((l) => ({ kind: "location", text: l.name, confidence: 0.9 })),
    ...sampleProps.map((p) => ({ kind: "object", text: p.name.toUpperCase(), confidence: 0.62 })),
  ];
  return (
    <div className="insp-stack">
      <Hint>
        Recognition preview. Characters and locations are detected live from the script; objects are
        sample data. Confirm / Ignore / Merge arrive with the recognition engine.
      </Hint>
      {candidates.map((c) => (
        <div key={`${c.kind}-${c.text}`} className="insp-card entity-card">
          <div className="insp-card-title">{c.text}</div>
          <div className="insp-card-meta">
            {c.kind} · confidence {Math.round(c.confidence * 100)}%
          </div>
          <div className="btn-row">
            <Planned label="Confirm" />
            <Planned label="Ignore" />
            <Planned label="Merge" />
          </div>
        </div>
      ))}
    </div>
  );
}
