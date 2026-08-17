# Screenplay Editor

SCS uses a typed block model: scene heading, action, character, dialogue, parenthetical, transition, shot, note, and imported fallback types. Scenes, cast, locations, hierarchy, pagination, and reports are derived from these blocks.

## The writing surface

The Write workspace renders US-Letter paper pages with real screenplay geometry: a 1.5in left margin, 2.2in character cues, a 3.5in dialogue column, and Courier typography on a warm white page. The caret's element is marked with a blue-pencil edge, named in the writing toolbar and status bar, and switchable from the toolbar select, the inspector's element grid, or the keyboard. Page zoom (85–130%) lives on the toolbar; focus mode strips every panel and leaves the paper with a small scene-navigation pill.

## Editing

- Enter follows screenplay flow; mid-block Enter splits. Enter on an empty Character returns that same line to Action. A single dialogue turn returns to action, while an uninterrupted exchange of two or more turns continues with a character cue. Repeated Enter on a blank action starts a scene heading.
- Backspace/Delete merge across block boundaries.
- Tab/Shift+Tab cycle types; Ctrl+1–8 select directly. Scene-heading and character options appear below the active line: click one, use any arrow key and Enter/Tab, or press Tab repeatedly to cycle. Scene-heading choices advance through INT./EXT./I/E., previous locations, the hidden hyphen step, and time of day; accepting the time moves to the next line.
- Tab on dialogue inserts a parenthetical with the caret inside `()`. Tabbing out of an untouched parenthetical removes the parentheses, and Enter before its closing parenthesis preserves the complete parenthetical before continuing to dialogue. Empty Character lines cycle through known character names with Tab.
- Ctrl/Cmd-drag across screenplay blocks selects a contiguous block range for copying. Dragging without the modifier retains normal within-block text selection.
- Ctrl/Cmd+Z and Ctrl/Cmd+Y provide bounded structural undo/redo (also on the toolbar).
- Headings, cues, and transitions uppercase while typing; `.heading` and `@name` force types.
- Existing characters, locations, and scene headings are suggested inline.
- Note blocks become beats; New Act blocks start acts.
- Pages use the same 55-line estimate as page counts and print with real boundaries; production page locks and revision colors mark page tops.

The full key reference is in `docs/KEYBOARD_SHORTCUTS.md`.

## Fountain source

The toolbar's Formatted / Fountain Source switch exposes the whole document as Fountain-inspired text; returning to Formatted re-parses it while preserving development metadata. Source text, selection, and mode are window/document-local until the buffer is submitted. A native window waits for coordinator acknowledgement before switching documents, returning to Formatted, following an import warning, or closing. If the accepted screenplay and the local buffer both changed, SCS keeps both complete texts and asks **Use accepted draft** or **Keep my source** instead of guessing a merge. If another window removed that screenplay, the orphaned buffer becomes read-only and can be downloaded before it is explicitly discarded.

## Current limitations

- Undo history is per-keystroke and bounded (100 steps); it does not persist across sessions.
- Pagination is an estimate (55 lines/page), not a full WYSIWYG layout engine.
- Inline text styling (bold/italic runs) from FDX is preserved in data but not yet editable visually.

FDX imports are editable. Original source files are never overwritten automatically; Export FDX writes a clean new file. Linked-file changes produce a conflict notice before metadata-preserving re-import.
