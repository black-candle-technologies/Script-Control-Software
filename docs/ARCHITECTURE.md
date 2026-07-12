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

The screenplay block list is the source for derived creative and production data. `src/domain/studio.ts` owns deterministic recognition, hierarchy, compiler, scene movement, FDX export, and scene-aware diff behavior. `src-tauri/src/project_file.rs` owns portable folder validation and round trips. Browser storage provides fast autosave; Save Portable Project is the durable, open-format path.

No hosted service is required. Collaboration uses portable projects plus Git/shared-drive sync, and assistance exports an opt-in prompt without transmitting data.
