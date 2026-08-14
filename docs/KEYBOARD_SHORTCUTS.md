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
| `Enter` | Next element in screenplay flow. A single dialogue turn returns to action; an uninterrupted exchange of two or more turns continues with a character cue. Mid-text splits the block, and repeated Enter on a blank action starts a scene heading |
| `Tab` / `Shift+Tab` | Cycle the current element type forward / backward. In a scene heading, Tab completes its prefix, prior location, separator, and time; in dialogue, Tab inserts a parenthetical and places the caret inside `()` |
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
