# Workspaces, Search, and Shortcuts

The shell is organized as **modes** on a left rail. Every mode swaps the workspace around the same open project.

| Mode | What it holds |
|---|---|
| Write | Scene navigator · screenplay paper · contextual inspector and reference panel |
| Outline | Acts, sequences, scenes, and beats with Act/Sequence/Scene/Beat/Timeline views |
| Treatment | Long-form Markdown treatments with links into structure and entities |
| Reference | Cast, Props, and Places sheets (detection with confirm/rename/merge/split) plus the opt-in Assist prompt |
| Series (TV) | Show bible, seasons, arcs, episode metadata, A/B/C stories, continuity database |
| Breakdown | Reports (structure, plot threads, pacing, department breakdowns, exports) and Production tools (revisions, page locks, schedules, sides) |
| Drafts | Save/restore draft versions, milestones, alternate drafts, compare, combine |
| Team | Roles, comments, suggestions, shared-copy and Git-backed sync |
| Companion | Final Draft watch-folder dashboard for FDX-first workflows |

Series appears only for television projects; the episode strip under the title bar switches episodes and adds new ones (blank or imported FDX).

## Panels

In Write mode the scene navigator (left) and inspector (right) collapse from the toolbar and resize by dragging their edges (arrow keys work on the handles). Widths, open states, and zoom persist per machine (`scs.ui.v1` in local storage). The inspector's **Reference** tab hosts persistent sources: previous draft, previous/next episode, targeted character/object/location sheets, show bible, season arc, plot history, and timeline continuity. Synchronized sources follow the active scene.

Mode selection maps onto the built-in layout ids from the domain model (`writer`, `development`, `revision`, `television`, `production`, `companion`), so projects saved by older builds reopen in the equivalent workspace. The saved-layout composer UI was retired in the interface redesign; layout validation and persistence remain in `src/domain/workspaceLayouts.ts`.

## Search

The command palette (`Mod+K`) searches every episode's headings and screenplay text, detected characters and objects, treatments, show-bible/season text, and saved draft versions, and offers direct commands: save, export, toggle panels, focus mode, and go-to-mode. Search stays available to read-only roles; restoring versions remains permission-gated.

## Shortcuts

Defaults: `Mod+K` palette · `Mod+S` save · `Mod+Shift+S` Save Draft Version. Bindings for the palette, save, version save, inspector toggle, and previous/next episode are stored per project and validated for collisions (see `docs/KEYBOARD_SHORTCUTS.md` for the full editing-key reference). `Mod` maps to Command on macOS and Control elsewhere.
