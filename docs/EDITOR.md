# The Screenplay Editor

Phase 1 ships a working block-based screenplay editor. This document describes
what it actually does today, what is placeholder, and the exact
Fountain-inspired rules it uses.

## What works today

- **Block model.** A screenplay is a flat list of typed blocks
  (`ScreenplayBlock` in `src/domain/screenplay.ts`). One block = one screenplay
  element. Scenes, characters and locations are always *derived* from the
  blocks, never stored separately, so the panels can't drift from the text.
- **Element types.** Scene Heading, Action, Character, Dialogue, Parenthetical,
  Transition, Shot, Note. Each renders with professional screenplay margins on
  a US-Letter page surface (Courier, 1.5" screenplay left margin, 3.5"
  dialogue column, centered-feeling character cues at 2.2", right-aligned
  transitions).
- **Element switching.** The toolbar dropdown, `Tab` / `Shift+Tab` (cycle), and
  `Ctrl+1`–`Ctrl+8` (direct) change the current block's type.
- **Keyboard flow.** `Enter` follows the classic screenwriting flow:

  | After | Enter creates |
  |---|---|
  | Scene Heading | Action |
  | Action | Action |
  | Character | Dialogue |
  | Parenthetical | Dialogue |
  | Dialogue | Character |
  | Transition | Scene Heading |
  | Shot / Note | Action |

  `Enter` mid-paragraph splits the block keeping its type. `Enter` on an empty
  block steps it forward through the same table instead of stacking blanks.
  `Backspace` at the start of a block merges it into the previous one;
  `Delete` at the end merges the next one in. Arrow keys cross block
  boundaries. `Shift+Enter` inserts a line break inside a block.
- **Live recognition while typing** (in Action blocks): `INT.` / `EXT.` /
  `EST.` lines become Scene Headings, `CUT TO:` -style lines and `FADE OUT.`
  become Transitions, a leading `.` forces a Scene Heading, a leading `@`
  forces a Character. Typing `(` at the start of a fresh Dialogue block turns
  it into a Parenthetical.
- **Scene navigator.** Detected scene headings populate the left panel; click a
  scene to jump to it. Act/sequence grouping is a labelled placeholder.
- **Fountain source view.** The toolbar toggle shows the document as
  Fountain-inspired plain text; switching back re-parses it.
- **Export Fountain** downloads the same text as a `.fountain` file.
- **Autosave.** The document persists to local app storage ~1s after each
  change (see `src/storage.ts` — the seam the Rust storage layer will replace).

## Fountain-inspired rules

Serialization and parsing live in `src/domain/fountain.ts` and follow
[Fountain](https://fountain.io) conventions closely enough that exports read
correctly in other Fountain tools:

- `INT.` / `EXT.` / `EST.` / `INT/EXT` lines → Scene Heading; `.FOO` forces one.
- Uppercase lines ending in `TO:` (or `> FOO`) → Transition. `FADE OUT.` and
  `FADE TO BLACK.` are also recognized.
- An uppercase line followed by text → Character cue; `@NAME` forces one.
  Cue extensions like `(V.O.)`, `(CONT'D)` are stripped when deriving the
  character list.
- `(text)` lines inside a dialogue group → Parenthetical.
- `!text` forces Action. All-caps Action is exported with a leading `!` so it
  round-trips.
- `Title:` / `Author:` leading lines → title page.

Where Fountain has no equivalent element, SCS uses two documented conventions:

- **Shot**: a lone uppercase paragraph (not a heading or transition) is read
  back as a Shot. Plain Fountain readers will treat it as action — harmless.
- **Note**: `[[text]]` becomes a Note *block* (Fountain treats notes as
  inline). Notes render as highlighted cards in the page and surface in the
  Scene panel as beat-style annotations.

## What is placeholder

Labelled as such in the UI:

- **Pagination** — the page count is an estimate (~55 lines/page), not real
  page breaks.
- **Title page** — title/author only; full title-page layout planned.
- **Act/sequence grouping** in the navigator, and **beats** under scenes.
- **Props panel** — seeded sample data until the recognition engine exists.
- **Drafts panel** — sample history plus session-only "Save Draft Version".
- **Series tab** — episode tabs demonstrate the TV direction; only the current
  script is real.
- **Entities tab** — recognition candidates are shown (characters/locations are
  live-derived, objects are sample); Confirm/Ignore/Merge are disabled.
- **FDX / PDF** — not implemented. SCS does not claim FDX compatibility yet;
  the plan is documented in the README. Buttons are disabled and marked
  "planned".

## Known limitations

- Structural edits (splits/merges/type changes) are not yet undoable;
  text-level undo works per block via the native editor.
- The editor is not paginated; very long scripts will render as one tall page.
- Dual dialogue, scene numbers, revision marks and page locking are not
  implemented.
