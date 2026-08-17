# Workspaces, Windows, Search, and Shortcuts

The shell is organized as **modes** on a left rail. Every mode is a useful preset around the same coordinated project; changing mode does not open a separate application or duplicate screenplay data.

| Mode | What it holds |
|---|---|
| Write | Accessible story tree · screenplay paper · contextual inspector and reference panel |
| Outline | Acts, sequences, scenes, and beats with Act/Sequence/Scene/Beat/Timeline views and the Visual Board |
| Treatment | Long-form Markdown treatments with links into structure and entities |
| Reference | Cast, Props, and Places sheets with detection, confirmation, rename, merge, and split controls |
| Series (TV) | Show bible, seasons, arcs, episode metadata, A/B/C stories, continuity database |
| Breakdown | Collapsible reports (structure, coverage, pacing, departments, detailed scenes, exports) and Production tools |
| Drafts | Save/restore versions, milestones, Alternate Drafts, compare, combine |
| Team | Roles, comments, suggestions, shared-copy and Git-backed sync |
| Companion | Final Draft watch-folder dashboard for FDX-first workflows |

Series appears only for television projects. The screenplay tab strip appears for every project type and can open any document in the project.

## Screenplay tabs

Tabs are generic window-local views, not television-only episode selectors. Each native window keeps its own open order, active document, recently closed views, active block, Fountain/source selection, and editor scroll. The portable `ProjectSession.activeDocumentId` remains only a compatibility/default value; one window changing tabs does not force another window to follow.

Tabs show the screenplay title and active state, plus linked FDX and read-only badges and dirty/saving/conflict status where available. Arrow keys, Home, and End change the active tab; `Alt+Shift+Left/Right` reorders it. **Close view** removes only that tab from the current window and keeps at least one view open. **Remove from project…** is deliberately separate: it requires edit permission, reports live dependencies, asks for confirmation, creates a protected Drafts snapshot, then removes and repairs live references.

## Native windows and the Window menu

In a Tauri desktop build, **Window** provides:

- **New Window**, **Open current screenplay in New Window**, **Open Current Layout in New Window**, and **Move current screenplay to New Window**.
- An accessible **Move screenplay** command and **Move/Copy panel** commands when another project window is available.
- **Bring All to Front**, a list of open project windows, and the **Leader** marker.
- **Reset Window Placement**, hidden-panel restore entries, built-in/custom layout entries, **Customize Current Layout**, and **Manage Layouts…**.
- **Close Window**.

The browser development build renders the same workspace but does not create OS windows; attempting a native window action reports that it is desktop-only.

All native windows for a project share one authoritative, revisioned Rust session. Durable actions include project/session/origin/action IDs and a base revision; the claimed actor must equal the authority's current collaborator. Accepted actions are broadcast once; duplicate IDs are idempotent; non-conflicting stale actions can reconcile; same-resource conflicts request a fresh snapshot. Bootstrap listeners buffer changes around the first snapshot, and edits made before readiness are replayed over that snapshot. The leader owns the serialized recovery/portable save path. Saves capture authority only after pending mutations finish, and saved path/timestamp metadata cannot replace newer live screenplay content. Closing a secondary window does not exit the project. Closing the leader promotes the oldest survivor. Closing the final window asks for confirmation and writes the emergency recovery state before exit when allowed.

Fountain buffers remain protected across that boundary. A tab/view/window/project exit waits for its submitted source mutation to be accepted. A rejected stale edit stays visible beside the accepted draft until the writer chooses one; neither recovery nor portable save overlays the unacknowledged buffer. If the underlying screenplay was removed remotely, SCS offers a local `.fountain` download before explicit discard.

Cross-window document/panel transfers use validated identifiers rather than serialized project content. The destination publishes a placement preview and must acknowledge the exact drag before the source removes anything. Stale source/destination revisions, a rejected target, cancellation, or a closing window leave the source unchanged. The coordinator provides the same move/copy semantics to Window-menu commands for the keyboard path. Tauri OS file-drop interception remains disabled so these internal transfers do not break Visual Board HTML drag/drop.

Open tabs, active mode/layout, selected board scene/beat, Write-tree collapse state, scroll, and Fountain selection persist as device-local preferences; none are written into `scs.project.json`. Active dock-panel identity, native geometry, and monitor placement are currently live-window state only and are not restored after restart. Supplied native geometry is clamped to a connected display and minimum size; **Reset Window Placement** recovers a misplaced current window. Automatic recreation of a previous multi-window set is not implied.

## Panels and layouts

In ordinary Write mode, the scene navigator (left) and inspector (right) collapse from the toolbar and resize by pointer or arrow keys on their handles. Chrome preferences and zoom are normalized under `scs.ui.v2`.

The mode presets correspond to the protected built-in layout IDs `writer`, `development`, `revision`, `television`, `production`, and `companion`. **Customize Current Layout** opens the registered panel renderer. It supports tab activation, drag-to-center tabbing, left/right/top/bottom splits, split resizing, logical floating panels, hiding/restoring closable panels, and active-scene/selection/scroll synchronization where registered. The screenplay or Companion root and other essential chrome cannot be hidden into an unrecoverable blank window.

**Manage Layouts…** can:

- place every registered panel into a tab group, split it on any edge, float it, or hide it with keyboard-operable controls;
- save the current arrangement as a named custom layout or update the active custom layout;
- apply or duplicate any layout;
- rename or delete a custom layout (built-ins cannot be renamed, overwritten, or deleted);
- reset to a built-in preset;
- restore all hidden panels and normalize off-screen logical floating frames;
- assign a validated layout shortcut.

Custom arrangements are stored as portable `layoutVersion: 2` nested dock trees. Split ratios and floating rectangles are logical workspace fractions and may travel with the project; physical native-window coordinates do not. Saving or updating a layout preserves the portable legacy/default `activeLayoutId`, while each window stores its current active layout in local UI preferences. Old flat tab-group/split layouts migrate on open. Cycles, duplicate panel ownership, invalid ratios, missing panels, or hostile geometry recover to a usable Writer-centered tree rather than crashing.

The inspector's **Reference** tab hosts previous draft, previous/next episode, targeted character/object/location sheets, show bible, season arc, plot history, and timeline continuity. Synchronized reference panels follow the active scene without creating another stored copy of script-derived data.

## Breakdown controls and exact references

The Breakdown workspace separates screenplay analysis from screenplay-wide elements. The **Reports** tab uses controlled disclosures for Overview, Plot threads, Structure and coverage, Treatment coverage, Unresolved beats, Character arcs, Pacing checks, Detailed scenes, and Export. The visible trigger keeps its label, count, warning state, or concise summary while collapsed, and children stay mounted. The **Global** tab gives Cast, Locations, Props, Vehicles, Animals, Weapons, Stunts, visual and sound effects, Wardrobe, Makeup, Night scenes, Crowd scenes, and High-complexity scenes their own controlled disclosures. All Global categories default open, retain an always-visible count, and are never nested behind another category. The **Production** tab continues to host page locking, revisions, schedules, sides, and department exports.

The Reports controls provide **Expand All**, **Collapse All**, and **Reset Sections**; Global provides its own **Expand All** and **Collapse All** controls. Individual and bulk choices persist for the current project/document scope as device-local `scs.ui.v2` preferences; malformed or missing preference data falls back to the defaults. These controls and each disclosure are ordinary keyboard-operable buttons with `aria-expanded` and live bulk-action feedback.

Each non-empty Global category has a **Filter & sort** drawer. Search uses space-separated terms across names, aliases, scene references, headings, evidence, and available entity metadata; **Show matches** keeps matching rows while **Exclude matches** removes them. Cast can sort by appearance, dialogue-line count in either direction, or scene count in either direction. Locations can sort by appearance, scene count, or name. Props, weapons, vehicles, animals, wardrobe, and the remaining production categories can sort by appearance, mention count, scene count, or name. The drawer reports the visible and total result counts, and **Clear** returns only that category to appearance order without changing screenplay data.

Object continuity, character dialogue, location appearances, production evidence, import warnings, and exact project-search results share the typed target path. Activating an occurrence opens its screenplay tab, switches to Write, scrolls to the stable block, focuses it, and selects/highlights the exact character range when one exists. If text moved, SCS may relocate the stored occurrence only within that same block. Otherwise it falls back to the original paragraph, then scene, and announces the fallback. It never jumps to a same-named global match. The highlight does not edit text or add undo/revision history and clears on edit, undo/redo, document/subsequent navigation, Escape, or timeout.

## Write tree and Visual Board

The Write navigator always exposes the real Act → Sequence → Scene → Beat hierarchy. Sequence labels remain visible even when an act has only one. Empty acts, empty sequences, and the Unassigned branch are explicit. Active editor scene, board-selected scene, and selected beat have separate semantics. Arrow keys, Home/End, Enter, and Space operate the `tree`/`treeitem` model; collapse state is per window/document.

On the Visual Board, a single scene-heading action opens the scene in Write, while double-click selects it for board operations. Selection is repaired when the document or story changes. **Add Beat** shows its destination before creation and targets the selected scene, then an unambiguous active scene, otherwise Unassigned—never an arbitrary first scene. Beat cards support double-click, right-click, Enter/F2, and a visible **Edit** action; the editor covers title, body, status, color, scene/sequence placement, and moments.

Scene dragging previews the exact before/after midpoint decision, sequence append/empty target, or Unassigned target without mutating data during hover. The same operations are buttons under **Move Scene…** and in the accessible scene menu opened by right-click, Context Menu/`Shift+F10`, or the visible overflow button. Board reordering changes only outline state until **Make Draft Match Outline** is explicitly chosen.

## Search and shortcuts

The command palette (`Mod+K`) searches every screenplay's headings and text, detected characters and objects, treatments, show-bible/season text, and saved versions. It also offers save/export, panel toggles, focus mode, and go-to-mode commands. Search stays available to read-only roles; durable content, document, layout, and collaboration mutations remain permission-checked.

Defaults: `Mod+K` palette · `Mod+S` save · `Mod+Shift+S` Save Draft Version. Project shortcut values are validated for syntax and collisions; layout shortcuts use `layout:<id>` action keys. `Mod` maps to Command on macOS and Control elsewhere. See [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md) for interaction-specific keys.
