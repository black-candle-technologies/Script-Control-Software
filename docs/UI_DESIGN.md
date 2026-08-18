# SCS Interface Design

The SCS interface is built around one idea: **the screenplay page is the product**. Everything else is quiet chrome that can be summoned or dismissed.

## Visual identity — "blue pencil"

- **Chrome** is warm graphite (`--bg-shell`, `--bg-app`, `--bg-panel`), deliberately darker and flatter than the writing surface so the paper always wins the contrast fight.
- **Paper** is a bright warm white (`--paper`) with US-Letter dimensions, real screenplay margins (1.5in left), and Courier typography.
- **Accent** is a desaturated editorial blue (`--accent`) — the writer's blue pencil. It marks the active scene, the caret's element, focus rings, and nothing decorative.
- **Brand mark** is one font-independent, optically centered SVG geometry shared by the launcher, import/loading treatment, title bar, and `public/scs.svg`. It uses paths rather than SVG text, so its shape and bounds do not change with installed fonts, zoom, theme, or DPI. A standalone mark has the accessible name “SCS”; a mark beside an existing product name or inside an already labeled button is decorative.
- All colors, radii, shadows, spacing, and motion durations are CSS custom properties declared once at the top of `src/App.css`. There is no external design framework.

## Application shell

```
┌──────────────────────────────────────────────────────────────┐
│ Title bar   SCS · project · save · Project · Window menu     │
│ Screenplay tabs (all project types)                          │
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
- **Screenplay tabs** (under the title bar): window-local views for every screenplay in a feature or television project. Tabs show active, linked-FDX, read-only, and save/conflict state. **Close view** does not remove the screenplay; the separate permission-checked removal command creates a protected snapshot first.
- **Scene navigator** (Write mode, collapsible, resizable): the real Act → Sequence → Scene → Beat hierarchy, including empty acts/sequences and an always-present Unassigned branch. Active and board-selected scenes are distinct.
- **Contextual inspector** (Write mode, collapsible, resizable): follows the caret — current element, current scene, its development metadata, beats, and notes. A second tab hosts persistent references (previous draft, previous/next episode, show bible, season arc, entity sheets, plot history, timeline).
- **Window menu**: creates/focuses native project windows, opens or moves the current screenplay, exposes panel and layout commands, identifies the project leader, resets placement, and closes only the current window unless it is the final project view.
- **Layout workspace and manager**: keep the mode rail as useful presets while allowing registered panels to be tabbed, split, floated, hidden/restored, resized, and saved as validated project layouts. Physical native-window placement is live native state and is not currently restored after restart.
- **Command palette** (`Ctrl+K`): searches every episode's text, scenes, characters, objects, treatments, and draft versions; also carries commands (save, export, toggle panels, focus mode, go-to-mode).
- **Focus mode**: hides all chrome except the paper and a bottom pill with previous/next scene, the current element, and an exit control. `Esc` leaves.

## Principles

1. **Get into the script fast.** The launcher is one screen with four actions and a recent list. Opening anything lands directly in Write mode.
2. **Contextual over permanent.** The old twelve-tab sidebar is gone; each heavy tool got a full-width workspace, and the right panel only shows what the caret touches.
3. **Writer vocabulary.** Drafts, Alternate Drafts, Compare, Restore, Milestones — never commits, branches, or merges (Git remains an implementation detail behind the Team panel's sync tools).
4. **Recognition is assistive, not a centerpiece.** Detected characters/objects/locations appear as reference sheets with confirm/rename/merge/split controls inside the Reference workspace.
5. **Pointer gestures have keyboard paths.** Tree navigation, board selection/context actions, scene moves, beat editing, tab changes, split resizing, and floating-panel movement do not require a drag, right-click, or double-click.
6. **Nothing decorative animates.** Motion is limited to ~140ms surface transitions and honors `prefers-reduced-motion`.

## Component architecture

- `Workspace.tsx` — shell orchestration and integration with the coordinated project session, portable save/import/export, and device-local preferences. Durable transformations live outside the component.
- `SceneNavigator.tsx`, `ContextInspector.tsx`, `Launcher.tsx`, `TitlePageEditor.tsx`, and `CollapsibleSection.tsx` — focused accessible surfaces.
- `Inspector.tsx` (`PanelHost`) — hosts the full-width workspace panels (Story, Treatment, Cast, Props, Places, Drafts, Breakdown, Series, Production, Team).
- `components/workspace/` — generic document tabs, the validated panel registry and recursive dock renderer, the Window menu, Layout Manager, and cross-window preview overlay.
- `BrandMark.tsx` + `domain/brandGeometry.ts` — the sole component and canonical path geometry for the visible SCS mark.
- `ui.tsx` — shared Menu, Segmented, EmptyState controls; `Icons.tsx` — one consistent inline 16px stroke icon set (no icon dependency).
- `domain/` owns script-target resolution, UI preference migration, document-tab state, board placement/selection, dock-tree validation, window/session protocols, and the other pure transformations exercised by unit tests.

## How this differs from the previous interface

The previous UI was a single crowded toolbar over an unvalidated free-form canvas, with every tool packed into a fixed right sidebar and a marketing-style home screen. The current design starts with a launcher → mode-rail shell, purpose-built mode presets, a contextual inspector, and a screenplay canvas that remains the visual center. Customization now returns through a registered panel renderer and validated nested dock tree rather than serialized UI components or arbitrary monitor coordinates. Older flat layouts migrate to the new tree, while malformed layouts recover to a usable Writer-centered arrangement.
