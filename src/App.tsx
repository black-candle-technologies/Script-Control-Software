import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Home, { type DocChoice } from "./components/Home.tsx";
import Workspace from "./components/Workspace.tsx";
import Dashboard from "./components/Dashboard.tsx";
import { createProjectSession, defaultAppInfo, emptyDocument, type AppInfo, type ProjectSession } from "./domain/index.ts";
import { sampleScreenplay } from "./domain/sample.ts";
import { loadSession } from "./storage.ts";
import { chooseAndOpenProject, chooseAndParseFdx, messageFrom } from "./services/fdxService.ts";
import "./App.css";

type View = "home" | "write" | "foundation";

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo);
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [docNonce, setDocNonce] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    // Ask the Rust command layer who we are. Falls back to static metadata when
    // the UI is rendered outside the Tauri shell (e.g. a plain browser preview).
    invoke<AppInfo>("get_app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(defaultAppInfo));
  }, []);

  const open = (choice: DocChoice) => {
    if (!confirmProjectReplacement(Boolean(session), choice !== "saved")) return;
    const next =
      choice === "saved"
        ? loadSession() ?? createProjectSession(sampleScreenplay())
        : choice === "sample"
          ? createProjectSession(sampleScreenplay())
          : createProjectSession(
              emptyDocument(choice === "new-show" ? "Untitled Episode" : "Untitled Screenplay"),
              choice === "new-show" ? "television" : "featureFilm",
            );
    if (choice === "new-show") next.name = "Untitled Show";
    setSession(next);
    setDocNonce((n) => n + 1);
    setView("write");
  };

  const savedTitle = view === "home" ? loadSession()?.name || null : null;

  const openFdx = async () => {
    if (!confirmProjectReplacement(Boolean(session))) return;
    setImporting(true);
    setImportError(null);
    try {
      const imported = await chooseAndParseFdx();
      if (!imported) return;
      setSession(createProjectSession(imported));
      setDocNonce((n) => n + 1);
      setView("write");
    } catch (error) {
      setImportError(messageFrom(error));
      setView("home");
    } finally {
      setImporting(false);
    }
  };

  const openProject = async () => {
    if (!confirmProjectReplacement(Boolean(session))) return;
    setImporting(true);
    setImportError(null);
    try {
      const project = await chooseAndOpenProject();
      if (!project) return;
      setSession(project);
      setDocNonce((nonce) => nonce + 1);
      setView("write");
    } catch (error) {
      setImportError(messageFrom(error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={`app view-${view}`}>
      <header className="topbar">
        <button className="wordmark" onClick={() => setView("home")} title="Home">
          {appInfo.short_name}
        </button>
        <span className="topbar-name">{appInfo.name}</span>
        <nav className="topbar-nav">
          {session && view !== "write" && (
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
          onOpenFdx={openFdx}
          onOpenProject={openProject}
          importError={importError}
          importing={importing}
          onShowFoundation={() => setView("foundation")}
        />
      )}

      {view === "write" && session && <Workspace key={docNonce} initialSession={session} onOpenFdx={openFdx} />}

      {view === "foundation" && (
        <main className="content">
          <div className="hero">
            <h1>Foundation status</h1>
            <p className="positioning">
              The architecture behind the writing workspace and its active local-first capabilities.
            </p>
          </div>
          <Dashboard />
        </main>
      )}
    </div>
  );
}

function confirmProjectReplacement(hasActiveSession: boolean, protectLocalRecovery = true): boolean {
  return (!hasActiveSession && (!protectLocalRecovery || !loadSession()))
    || window.confirm("Open a different project? Your current local recovery will be replaced when the new project autosaves. Save a portable copy first if you need to keep both.");
}

export default App;
