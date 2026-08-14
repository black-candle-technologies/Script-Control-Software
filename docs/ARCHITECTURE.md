# Architecture

SCS is a Tauri 2 application with a React/TypeScript workspace and Rust file/parser commands.

```text
React workspace
  screenplay editor · development/TV/production · layouts · collaboration
        │ Tauri commands
Rust backend
  FDX parser · crash-recoverable project I/O · watch folders · hardened Git adapter
        │
Open local data
  scs.project.json · Fountain/FDX · reports · provider folders · HTTPS Git
```

One versioned `ProjectSession` is the runtime unit: all episode documents, shared series/collaboration/layout data, and history move and persist together. Screenplay block lists are the source for derived creative and production data. `src/domain/analysis.ts` owns deterministic recognition and reports; `src/domain/story.ts` owns editable hierarchy and board order; `src/domain/versioning.ts` owns project/episode/season/show-bible snapshots, ID-keyed/per-field three-way merges, comparisons, and project-wide branches; `src/domain/workspaceLayouts.ts` validates the tab/split/floating runtime topology; `src/domain/collaboration.ts` owns permissions and review/approval/room transitions. `src-tauri/src/project_file.rs` validates portable data, replaces the authoritative JSON manifest through a synchronized temporary file, and recovers its protected backup after an interrupted replacement. Fountain files are secondary mirrors refreshed after that manifest commit, so the folder is not presented as one multi-file atomic transaction. `src-tauri/src/external_files.rs` confines Companion-mode handoff and watch-folder reads, while `src-tauri/src/git_sync.rs` confines writer-facing Git operations. Browser storage is an emergency recovery cache; **Save Project** writes the opened portable manifest (or prompts for one on first save), and **Save Project As…** creates another durable open-format copy.

Portable serialization deliberately separates shared data from machine state. Acting identity, absolute mount/watch/linked-FDX paths, linked-file timestamps, Git author preferences, and last-sync state stay local and are ignored by collaborator merges. Snapshot sessions are also sanitized so history cannot leak those values. No hosted service is required. Collaboration uses portable projects plus Git/shared-drive sync, and assistance exports an opt-in prompt without transmitting data.
