import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Dashboard from "./components/Dashboard.tsx";
import { defaultAppInfo, type AppInfo } from "./domain/index.ts";
import "./App.css";

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo);

  useEffect(() => {
    // Ask the Rust command layer who we are. Falls back to static metadata when
    // the UI is rendered outside the Tauri shell (e.g. a plain browser preview).
    invoke<AppInfo>("get_app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(defaultAppInfo));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">{appInfo.short_name}</span>
        <span className="topbar-name">{appInfo.name}</span>
        <span className="phase-chip">
          {appInfo.phase} · v{appInfo.version}
        </span>
      </header>

      <main className="content">
        <div className="hero">
          <h1>{appInfo.name}</h1>
          <span className="subtitle">{appInfo.short_name}</span>
          <p className="positioning">{appInfo.tagline}</p>
        </div>

        <Dashboard />

        <p className="foot-note">
          Phase 0 foundation — this is the architecture, not the features.
          Nothing here writes to disk yet.
        </p>
      </main>
    </div>
  );
}

export default App;
