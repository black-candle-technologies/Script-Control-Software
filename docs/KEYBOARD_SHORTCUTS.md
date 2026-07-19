# Keyboard Shortcuts

`Mod` is Command on macOS and Control elsewhere. The first three are user-configurable per project (collisions are validated); the rest are fixed editor behavior.

## Application

| Keys | Action |
|---|---|
| `Mod+K` | Command palette — search and commands |
| `Mod+S` | Save (local recovery + portable project) |
| `Mod+Shift+S` | Save Draft Version |
| `Esc` | Close palette · exit focus mode |

Configurable actions also include the inspector toggle and previous/next episode; assign them in the project's shortcut settings (stored with the project workspace).

## Screenplay editing

| Keys | Action |
|---|---|
| `Enter` | Next element in screenplay flow (heading → action, character → dialogue, dialogue → character, transition → heading). Mid-text splits the block; on an empty block it steps the element forward |
| `Tab` / `Shift+Tab` | Cycle the current element type forward / backward |
| `Ctrl+1`–`Ctrl+8` | Set element directly: Scene Heading, Action, Character, Dialogue, Parenthetical, Transition, Shot, Note |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (also on the writing toolbar) |
| `Backspace` at start | Merge into the previous block |
| `Delete` at end | Merge the next block in |
| `↑` / `↓` at block edge | Move the caret across blocks |

## Typing recognition

- `INT.` / `EXT.` (and `CUT TO:`-style lines) convert an Action block automatically.
- `.heading` forces a Scene Heading; `@name` forces a Character cue.
- `(` at the start of an empty Dialogue block becomes a Parenthetical.
- Headings, cues, and transitions uppercase as you type.

## Panels

The navigator/inspector resize handles accept `←` / `→` when focused.
