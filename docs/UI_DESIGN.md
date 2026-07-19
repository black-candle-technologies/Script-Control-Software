# SCS Interface Design

The SCS interface is built around one idea: **the screenplay page is the product**. Everything else is quiet chrome that can be summoned or dismissed.

## Visual identity — "blue pencil"

- **Chrome** is warm graphite (`--bg-shell`, `--bg-app`, `--bg-panel`), deliberately darker and flatter than the writing surface so the paper always wins the contrast fight.
- **Paper** is a bright warm white (`--paper`) with US-Letter dimensions, real screenplay margins (1.5in left), and Courier typography.
- **Accent** is a desaturated editorial blue (`--accent`) — the writer's blue pencil. It marks the active scene, the caret's element, focus rings, and nothing decorative.
- All colors, radii, shadows, spacing, and motion durations are CSS custom properties declared once at the top of `src/App.css`. There is no external design framework.

## Application shell

```
┌──────────────────────────────────────────────────────────────┐
│ Title bar   SCS · project name · save state · Project menu   │
│ Episode strip (television projects only)                     │
├────┬─────────────────────────────────────────────────────────┤
│ M  │ Write: navigator │ writing toolbar + paper │ inspector  │
│ o  │ Other modes: full-width workspace with its own header   │
│ d  │                                                         │
│ e  │                                                         │
│ s  │                                                         │
├────┴─────────────────────────────────────────────────────────┤
│ Status bar  element · scenes · pages · words · draft · saved │
└──────────────────────────────────────────────────────────────┘
```

- **Mode rail** (left, 64px): Write, Outline, Treatment, Reference, Series (TV), Breakdown, Drafts, Team, Companion. Switching modes swaps the workspace around the same project — it never opens a separate app.
- **Scene navigator** (Write mode, collapsible, resizable): the real Act → Sequence → Scene → Beat hierarchy, never a flat list.
- **Contextual inspector** (Write mode, collapsible, resizable): follows the caret — current element, current scene, its development metadata, beats, and notes. A second tab hosts persistent references (previous draft, previous/next episode, show bible, season arc, entity sheets, plot history, timeline).
- **Command palette** (`Ctrl+K`): searches every episode's text, scenes, characters, objects, treatments, and draft versions; also carries commands (save, export, toggle panels, focus mode, go-to-mode).
- **Focus mode**: hides all chrome except the paper and a bottom pill with previous/next scene, the current element, and an exit control. `Esc` leaves.

## Principles

1. **Get into the script fast.** The launcher is one screen with four actions and a recent list. Opening anything lands directly in Write mode.
2. **Contextual over permanent.** The old twelve-tab sidebar is gone; each heavy tool got a full-width workspace, and the right panel only shows what the caret touches.
3. **Writer vocabulary.** Drafts, Alternate Drafts, Compare, Restore, Milestones — never commits, branches, or merges (Git remains an implementation detail behind the Team panel's sync tools).
4. **Recognition is assistive, not a centerpiece.** Detected characters/objects/locations appear as reference sheets with confirm/rename/merge/split controls inside the Reference workspace.
5. **Nothing decorative animates.** Motion is limited to ~140ms surface transitions and honors `prefers-reduced-motion`.

## Component architecture

- `Workspace.tsx` — shell state and all project behavior (save, versions, revisions, sync, import/export). Presentation-only components hang off it.
- `SceneNavigator.tsx`, `ContextInspector.tsx`, `Launcher.tsx` — dedicated presentation components.
- `Inspector.tsx` (`PanelHost`) — hosts the full-width workspace panels (Story, Treatment, Cast, Props, Places, Drafts, Breakdown, Series, Production, Team, Assist).
- `ui.tsx` — shared Menu, Segmented, EmptyState controls; `Icons.tsx` — one consistent inline 16px stroke icon set (no icon dependency).
- Domain logic lives entirely under `src/domain/` and is unchanged by the interface.

## How this differs from the previous interface

The previous UI was a single crowded toolbar over a free-form tab-group/split/floating-panel canvas, with every tool packed into a fixed right sidebar and a marketing-style home screen. The redesign replaces that with a launcher → mode-rail shell: fixed, purpose-built workspaces, a contextual inspector, and a screenplay canvas that is always the visual center. The saved-layout composer UI was retired with it; layout persistence remains in the domain model, and modes map onto the built-in layout ids so older projects reopen in the equivalent workspace.
