# Screenplay Editor

SCS uses a typed block model: scene heading, action, character, dialogue, parenthetical, transition, shot, note, and imported fallback types. Scenes, cast, locations, hierarchy, pagination, and reports are derived from these blocks.

## The writing surface

The Write workspace renders US-Letter paper pages with real screenplay geometry: a 1.5in left margin, 2.2in character cues, a 3.5in dialogue column, and Courier typography on a warm white page. The caret's element is marked with a blue-pencil edge, named in the writing toolbar and status bar, and switchable from the toolbar select, the inspector's element grid, or the keyboard. Page zoom (85–130%) lives on the toolbar; focus mode strips every panel and leaves the paper with a small scene-navigation pill.

## Editing

- Enter follows screenplay flow; mid-block Enter splits; Enter on an empty block steps its element forward.
- Backspace/Delete merge across block boundaries.
- Tab/Shift+Tab cycle types; Ctrl+1–8 select directly.
- Ctrl/Cmd+Z and Ctrl/Cmd+Y provide bounded structural undo/redo (also on the toolbar).
- Headings, cues, and transitions uppercase while typing; `.heading` and `@name` force types.
- Existing characters, locations, and scene headings are suggested inline.
- Note blocks become beats; New Act blocks start acts.
- Pages use the same 55-line estimate as page counts and print with real boundaries; production page locks and revision colors mark page tops.

The full key reference is in `docs/KEYBOARD_SHORTCUTS.md`.

## Fountain source

The toolbar's Formatted / Fountain Source switch exposes the whole document as Fountain-inspired text; returning to Formatted re-parses it while preserving development metadata.

## Current limitations

- Undo history is per-keystroke and bounded (100 steps); it does not persist across sessions.
- Pagination is an estimate (55 lines/page), not a full WYSIWYG layout engine.
- Inline text styling (bold/italic runs) from FDX is preserved in data but not yet editable visually.

FDX imports are editable. Original source files are never overwritten automatically; Export FDX writes a clean new file. Linked-file changes produce a conflict notice before metadata-preserving re-import.
