# Screenplay Editor

SCS uses a typed block model: scene heading, action, character, dialogue, parenthetical, transition, shot, note, and imported fallback types. Scenes, cast, locations, hierarchy, pagination, and reports are derived from these blocks.

## Editing

- Enter follows screenplay flow; mid-block Enter splits.
- Backspace/Delete merge across block boundaries.
- Tab/Shift+Tab cycle types; Ctrl+1–8 select directly.
- Ctrl/Cmd+Z and Ctrl/Cmd+Y provide bounded structural undo/redo.
- Headings, cues, and transitions uppercase while typing.
- Existing characters, locations, and scene headings are suggested inline.
- Note blocks become beats; New Act blocks start acts.
- Pages use the same 55-line estimate as page counts and print with real boundaries.

FDX imports are editable. Original source files are never overwritten automatically; Export FDX writes a clean new file. Linked-file changes produce a conflict notice before metadata-preserving re-import.
