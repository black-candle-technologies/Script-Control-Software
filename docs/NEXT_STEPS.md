# Next Steps

Recommended order for the next passes, building on the Phase 1 writing
workspace. Each slice is small enough to ship on its own.

## 1. Persistence beyond localStorage

Replace `src/storage.ts` with Tauri commands that read/write a real `.scs`
project folder (`scs.project.json` + a `scripts/main.fountain`). The seam
already exists — nothing else touches storage directly. Add Open Project /
recent-projects behavior on the home screen.

## 2. Editor hardening

- Undo/redo for structural edits (block splits/merges/type changes) — a simple
  bounded history of `blocks` snapshots is enough.
- Character autocomplete: the derived character list already exists; suggest
  names when typing in a Character block.
- Smart-type uppercase-as-you-type for headings/cues (currently CSS-only).

## 3. Real pagination

Compute page breaks from the same line-width table used by `estimatePages`
and render page boundaries. This unlocks honest page counts, scene page
numbers in the navigator, and PDF export later.

## 4. FDX import (read-only first)

Parse `.fdx` XML into `ScreenplayBlock[]` (the element types map almost 1:1).
Import before export — reading other people's files is the adoption path, and
export can't be verified without import anyway. Keep the "no FDX compatibility
claimed" language until round-tripping is tested against real files.

## 5. Draft versions for real

Store snapshots of the serialized Fountain text under the project folder
(`.scs/versions/`). "Save Draft Version" already exists in the UI; wire it to
disk and list real history. Scene-aware diff can start as: parse two versions,
compare derived scene lists.

## 6. Beats and structure

Let writers add beats under scenes in the navigator (the `[[note]]` blocks
already surface in the Scene panel). Then act/sequence grouping — the domain
models (`Act`, `Sequence`, `Beat`) are drafted in `src/domain/hierarchy.ts`.

## Deliberately not next

- Cloud/collaboration, AI features — out of scope by design.
- A rich-text editor framework — the textarea-per-block editor is small,
  reliable and fully styleable; don't replace it until a concrete need
  (inline bold/italics, dual dialogue) appears.
- Lint/format tooling — nice-to-have; the repo currently has no eslint/prettier
  and adding deps is blocked by a pnpm store mismatch on the dev machine.
