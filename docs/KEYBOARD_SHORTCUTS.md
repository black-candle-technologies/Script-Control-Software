# Keyboard Shortcuts

`Mod` is Command on macOS and Control elsewhere. Project shortcuts are normalized and collision-checked; fixed component keys follow the platform's standard button, tab, tree, and menu behavior.

## Application

| Keys | Action |
|---|---|
| `Mod+K` | Command palette — project-wide search and commands |
| `Mod+S` | Save emergency recovery and the opened portable project |
| `Mod+Shift+S` | Save Draft Version |
| `Esc` | Close the command palette · exit focus mode · clear an exact-reference highlight while the editor has focus |

Configurable actions also include inspector toggle and previous/next episode. Layout shortcuts are stored as `layout:<id>` actions. Assign them through the project shortcut controls and Layout Manager; a collision is rejected rather than silently shadowing another command.

## Screenplay document tabs

| Keys | Action |
|---|---|
| `Left` / `Right` | Activate the previous/next open screenplay tab |
| `Home` / `End` | Activate the first/last open screenplay tab |
| `Alt+Shift+Left` / `Alt+Shift+Right` | Move the focused screenplay tab one position |
| `Mod+Delete` | Close the focused window-local view; this never invokes **Remove from project…** |

Closing a view does not delete screenplay content. Permanent removal remains a separately labeled, permission-checked, confirmed command with a protected recovery snapshot.

## Native Window and layout menus

| Keys | Action |
|---|---|
| `Up` / `Down` | Move through enabled Window-menu items |
| `Home` / `End` | Focus the first/last enabled Window-menu item |
| `Enter` / `Space` | Invoke the focused Window/Layout command |
| `Esc` | Close the Window menu and restore focus to its button |

Use the Window menu's **Move screenplay** and **Move/Copy panel** entries as the keyboard alternative to cross-window dragging. **Manage Layouts…** exposes named buttons for apply, save/update, duplicate, rename/delete, reset, restore hidden/off-screen panels, and shortcut assignment.

## Screenplay editing

| Keys | Action |
|---|---|
| `Enter` | Next element in screenplay flow. An empty Character returns to Action on the same line. A single dialogue turn returns to action; an uninterrupted exchange of two or more turns continues with a character cue. Mid-text splits the block, and repeated Enter on a blank action starts a scene heading |
| `Tab` / `Shift+Tab` | Cycle the current element type forward / backward. Tab cycles scene-heading and character suggestions; when a suggestion is selected with Up/Down, Enter or Tab accepts it. In dialogue, Tab inserts a parenthetical and places the caret inside `()`; Tab on untouched `()` returns to dialogue |
| `Ctrl+1`–`Ctrl+8` | Set element directly: Scene Heading, Action, Character, Dialogue, Parenthetical, Transition, Shot, Note |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (also on the writing toolbar) |
| `Backspace` at start | Merge into the previous block |
| `Delete` at end | Merge the next block in |
| Arrow keys | Left/Up select the previous visible suggestion and Right/Down select the next; without suggestions, Up/Down move the caret across blocks at a block edge |
| `Ctrl/Cmd` + drag | Select a contiguous range of screenplay blocks for copying; an unmodified drag stays within one block |

## Exact script references

Object-continuity, character-dialogue, location-appearance, production-evidence, import-warning, and project-search links are native buttons, so Tab focuses them and Enter/Space activates them. Activation switches to the target screenplay and Write mode, selects the exact range when supplied, and reports exact, relocated-same-block, paragraph, scene, or missing fallback. Escape clears the transient selection; edit, undo/redo, document/subsequent navigation, and timeout clear it as well.

## Write story tree

The navigator uses one roving-focus `tree`/`treeitem` model across Act → Sequence → Scene → Beat and Unassigned.

| Keys | Action |
|---|---|
| `Down` / `Up` | Focus the next/previous visible tree item |
| `Home` / `End` | Focus the first/last visible tree item |
| `Right` | Expand a collapsed branch; from an expanded branch, focus its first child |
| `Left` | Collapse an expanded branch; otherwise focus its parent |
| `Enter` / `Space` | Toggle an Act/Sequence/Unassigned branch or activate the focused Scene/Beat |

Empty acts/sequences and an empty Unassigned branch remain announced but are disabled placeholders rather than fake destinations.

## Breakdown

Tab to a section heading and press Enter/Space to toggle it; the button exposes `aria-expanded`. **Expand All**, **Collapse All**, and **Reset Sections** are ordinary buttons and announce the bulk result. Occurrence links inside production reports use the exact-reference behavior above.

## Visual Board

| Keys | Action |
|---|---|
| Context Menu key or `Shift+F10` on a scene | Open the scene menu; the visible overflow button is another keyboard target |
| `Up` / `Down`, `Home` / `End` in the scene menu | Move menu focus |
| `Tab` / `Shift+Tab` in the scene menu | Cycle within the menu |
| `Esc` in the scene menu | Dismiss and restore trigger focus |
| **Select/Deselect Scene** menu item | Keyboard equivalent of double-click board selection |
| `Enter` or `F2` on a beat card | Open the beat editor; right-click, double-click, and the visible **Edit** button do the same |
| `Mod+Enter` in the beat editor | Save title/body/status/color/placement/moment edits |
| `Esc` in the beat editor | Cancel and restore focus to the beat card |
| `Esc` during a board drag | Cancel preview/move and leave the outline unchanged |

Each scene also has a **Move Scene…** disclosure with buttons for before/after, sequence start/end, and Unassigned placements. These are the keyboard alternative to drag placement. Moving the outline never changes screenplay order until **Make Draft Match Outline** is explicitly activated.

## Docked and floating panels

| Focus | Keys | Action |
|---|---|---|
| Workspace panel tab | `Left` / `Right`, `Home` / `End` | Activate and focus another panel in the tab group |
| Workspace panel tab | `Alt+Shift+Left` / `Alt+Shift+Right` | Reorder the focused panel within its tab group |
| Horizontal split divider | `Left` / `Right` | Resize adjacent panels by a logical 2.5% step |
| Vertical split divider | `Up` / `Down` | Resize adjacent panels by a logical 2.5% step |
| Floating-panel **Move** button | Arrow keys | Move by 1.5%; hold Shift for 5% |
| Floating-panel resize separator | Arrow keys | Resize by 1.5%; hold Shift for 5% |

Each active tab group and the Layout Manager expose a labeled **Place _panel_** selector for joining another tab group, splitting on any edge, or floating without dragging. **Float**, **Hide**, Window-menu **Show**, and Layout Manager restore buttons provide additional labeled non-drag actions.

## Typing recognition

- `INT.` / `EXT.` (and `CUT TO:`-style lines) convert an Action block automatically.
- `.heading` forces a Scene Heading; `@name` forces a Character cue.
- `(` at the start of an empty Dialogue block becomes a Parenthetical.
- Headings, cues, and transitions uppercase as you type.

## Fixed Write panels

The ordinary Write navigator/inspector resize handles accept `Left` / `Right` when focused.
