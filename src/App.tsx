import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Home, { type DocChoice } from "./components/Home.tsx";
import Workspace from "./components/Workspace.tsx";
import Dashboard from "./components/Dashboard.tsx";
import { defaultAppInfo, emptyDocument, type AppInfo, type ScreenplayDocument } from "./domain/index.ts";
import { sampleScreenplay } from "./domain/sample.ts";
import { loadDocument } from "./storage.ts";
import "./App.css";

type View = "home" | "write" | "foundation";

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo);
  const [view, setView] = useState<View>("home");
  const [doc, setDoc] = useState<ScreenplayDocument | null>(null);
  const [docNonce, setDocNonce] = useState(0);

  useEffect(() => {
    // Ask the Rust command layer who we are. Falls back to static metadata when
    // the UI is rendered outside the Tauri shell (e.g. a plain browser preview).
    invoke<AppInfo>("get_app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(defaultAppInfo));
  }, []);

  const open = (choice: DocChoice) => {
    const next =
      choice === "saved"
        ? loadDocument() ?? sampleScreenplay()
        : choice === "sample"
          ? sampleScreenplay()
          : emptyDocument();
    setDoc(next);
    setDocNonce((n) => n + 1);
    setView("write");
  };

  const savedTitle = view === "home" ? loadDocument()?.titlePage.title || null : null;

  return (
    <div className={`app view-${view}`}>
      <header className="topbar">
        <button className="wordmark" onClick={() => setView("home")} title="Home">
          {appInfo.short_name}
        </button>
        <span className="topbar-name">{appInfo.name}</span>
        <nav className="topbar-nav">
          {doc && view !== "write" && (
            <button className="link-btn" onClick={() => setView("write")}>
              Back to script
            </button>
          )}
          {view === "foundation" && (
            <button className="link-btn" onClick={() => setView("home")}>
              Home
            </button>
          )}
        </nav>
        <span className="phase-chip">
          {appInfo.phase} · v{appInfo.version}
        </span>
      </header>

      {view === "home" && (
        <Home
          appInfo={appInfo}
          savedTitle={savedTitle}
          onOpen={open}
          onShowFoundation={() => setView("foundation")}
        />
      )}

      {view === "write" && doc && <Workspace key={docNonce} initialDoc={doc} />}

      {view === "foundation" && (
        <main className="content">
          <div className="hero">
            <h1>Foundation status</h1>
            <p className="positioning">
              The architecture behind the writing workspace — what is real today versus drafted or
              planned.
            </p>
          </div>
          <Dashboard />
        </main>
      )}
    </div>
  );
}

export default App;
