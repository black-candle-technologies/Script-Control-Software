# Architecture

SCS is a Tauri 2 application with a React/TypeScript workspace and Rust file/parser commands.

```text
React workspace
  screenplay editor · story/treatment/entity/version/TV/production panels
        │ Tauri commands
Rust backend
  FDX parser · portable project I/O · linked-file timestamps
        │
Open local data
  scs.project.json · Fountain/FDX · Markdown/CSV/JSON · .scs working data
```

One versioned `ProjectSession` is the runtime unit: all episode documents, shared series/collaboration/layout data, and history move and persist together. Screenplay block lists are the source for derived creative and production data. `src/domain/studio.ts` owns deterministic recognition, compiler, FDX export, and scene-aware diff behavior; `src/domain/story.ts` owns editable hierarchy and board order. `src-tauri/src/project_file.rs` validates and atomically round-trips portable folders. Browser storage is an emergency recovery cache; Save Portable Project is the durable, open-format path.

No hosted service is required. Collaboration uses portable projects plus Git/shared-drive sync, and assistance exports an opt-in prompt without transmitting data.
