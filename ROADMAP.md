# ROADMAP.md

# Script Control Software (SCS) Roadmap

> Implementation status (July 2026): every phase has a working local-first baseline in the application. Provider-dependent scale features use the smallest safe implementation: collaboration is portable-project/Git/shared-drive based, PDF uses native printing, and optional assistance produces a private companion prompt without sending data. Hosted sync, real-time rooms, and direct AI-provider calls remain deployment choices rather than core dependencies. See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md).

Script Control Software, also known as **SCS**, is intended to become a local-first professional screenwriting and story development application. The long-term goal is to combine the familiar writing power of Final Draft-style screenplay software with a deeper development workspace for beat boards, treatments, character/object tracking, television continuity, Git-style version control, and generated script breakdowns.

This roadmap is organized by development phases. Each phase should produce a usable version of SCS while building toward the larger vision.

---

## Guiding Product Principles

1. **FDX compatibility first**  
   SCS should open, parse, edit, preserve, and export `.fdx` files as cleanly as possible. Writers should be able to keep using existing Final Draft files instead of being trapped in a proprietary-only format.

2. **Local-first by default**  
   Projects should live on the user’s computer. Cloud sync and collaboration can come later, but the core application should not require a server to function.

3. **Professional screenplay formatting**  
   SCS should support industry-standard screenplay formatting, pagination, page behavior, revision tools, and export workflows.

4. **Story structure should be hierarchical**  
   The development system should distinguish between **acts**, **sequences**, **scenes**, **beats**, and smaller story moments. It should not flatten everything into generic beat cards.

5. **Version control should be writer-friendly**  
   SCS should bring Git-style versioning to screenwriting without forcing writers to understand programmer terminology.

6. **The script should become structured data**  
   Characters, locations, props, objects, acts, sequences, scenes, beats, dialogue, revisions, and production elements should be parsed and connected across the project.

7. **Television should be first-class**  
   SCS should support shows, seasons, episodes, episode tabs, season arcs, show bibles, continuity tracking, recurring characters, objects, plot threads, and multi-episode reference workflows.

---

## Phase 0 — Project Foundation

### Goals

Establish the technical foundation, repository structure, project architecture, and core data models.

### Core Tasks

- Choose the desktop stack.
  - Recommended: **Tauri + React/TypeScript + Rust**.
  - Alternative: Electron + React/TypeScript + Node.
- Create the initial application shell.
- Define the SCS project format.
- Define internal screenplay data models.
- Define project-level data models for:
  - Feature films
  - Television shows
  - Seasons
  - Episodes
  - Acts
  - Sequences
  - Scenes
  - Beats
  - Characters
  - Objects/props
  - Locations
  - Treatments
  - Notes
  - Breakdowns
  - Versions
- Decide how local project metadata will be stored.
  - Recommended: SQLite for application speed plus exportable JSON for portability.
- Set up basic CI checks.
- Set up linting, formatting, and test tooling.
- Add placeholder README, ROADMAP, and contribution docs.

### Deliverable

A working desktop app shell with a defined architecture and project format.

---

## Phase 1 — FDX Parser and Read-Only Project Viewer

### Goals

Make SCS useful as a read-only development dashboard for existing `.fdx` files.

### Core Tasks

- Build an FDX XML parser.
- Convert `.fdx` screenplay data into an internal screenplay model.
- Detect screenplay paragraph types:
  - Scene headings
  - Action
  - Character names
  - Dialogue
  - Parentheticals
  - Transitions
  - Shots
  - General text
- Detect scenes from scene headings.
- Generate a scene list.
- Generate basic character list from dialogue blocks.
- Generate basic location list from scene headings.
- Display screenplay text in a formatted read-only viewer.
- Display scenes in a side panel.
- Display basic project metadata.
- Support opening local `.fdx` files.
- Support creating an SCS project around an existing `.fdx` file.

### Feature-Film Support

- Single script per project.
- Basic scene navigator.
- Basic character detection.
- Basic location detection.

### Television Support

- Create a show workspace.
- Add one or more episode `.fdx` files.
- Display episode scripts in tabs.
- Switch between episode tabs without closing the workspace.
- Generate episode-level scene lists.
- Generate show-level character list across episodes.

### Deliverable

Users can open existing FDX files and view them inside SCS with parsed scenes, characters, locations, and episode tabs.

---

## Phase 2 — Scene Board, Story Hierarchy, and Treatment Workspace

### Goals

Build the first major differentiator: a real development workspace that understands acts, sequences, scenes, and beats.

### Core Tasks

- Add a scene card board.
- Add drag-and-drop scene card rearrangement in project metadata.
- Add scene summaries.
- Add scene notes.
- Add scene tags.
- Add scene status tracking.
- Add act containers.
- Add sequence containers inside acts.
- Add beat cards inside scenes or sequences.
- Allow users to define custom story structures.
- Support multiple board views:
  - Act view
  - Sequence view
  - Scene view
  - Beat view
  - Timeline view
- Add treatment documents.
- Allow treatment sections to link to:
  - Acts
  - Sequences
  - Scenes
  - Beats
  - Characters
  - Objects
  - Locations
- Add markdown-based treatment editing.
- Add export for treatments to Markdown and PDF.

### Story Hierarchy Model

SCS should support this general hierarchy:

```text
Project
  Feature Film or Show
    Season, optional for TV
      Episode, optional for TV
        Act
          Sequence
            Scene
              Beat
                Moment, optional
```

### Deliverable

Users can outline and develop a story using acts, sequences, scenes, and beats instead of a flat board of generic cards.

---

## Phase 3 — Editable Screenplay Mode and FDX Round-Tripping

### Goals

Move from read-only FDX support to real screenplay editing.

### Core Tasks

- Build the screenplay editor.
- Support screenplay-specific keyboard behavior.
- Support element switching:
  - Scene heading
  - Action
  - Character
  - Dialogue
  - Parenthetical
  - Transition
  - Shot
- Preserve screenplay formatting while editing.
- Save edits into the internal screenplay model.
- Export back to valid `.fdx`.
- Add Fountain export.
- Add PDF export.
- Add basic title page support.
- Add auto-complete for character names.
- Add auto-complete for existing locations.
- Add auto-complete for scene headings.
- Add basic page estimation.
- Add warnings when export may not preserve every FDX feature.

### Final Draft Interoperability

- Open `.fdx` files created by Final Draft.
- Export `.fdx` files that can be opened in Final Draft.
- Keep SCS metadata separate where possible so external FDX workflows remain clean.
- Begin external FDX linked-file support.

### Deliverable

Users can write, edit, and export FDX-compatible screenplay files from SCS.

---

## Phase 4 — Character, Object, and Location Recognition Engine

### Goals

Make the compiler understand the entities moving through the script.

### Core Tasks

- Build deterministic recognition for characters from dialogue blocks.
- Detect first character appearances.
- Detect character descriptions near first appearance.
- Detect locations from scene headings.
- Detect recurring props and objects from action lines.
- Detect likely vehicles, weapons, documents, devices, animals, and important recurring items.
- Allow users to confirm, reject, rename, merge, or split detected entities.
- Create character sheets from detected characters.
- Create object/prop sheets from detected objects.
- Create location sheets from detected locations.
- Link entities to scenes automatically.
- Track entity appearances across the script.
- Track entity changes across versions.

### Character Recognition Features

- Character name detection.
- Alias detection.
- Dialogue count.
- Scene count.
- First appearance.
- Last appearance.
- Co-appearance tracking.
- Character absence gaps.
- Character-specific dialogue view.

### Object Recognition Features

- Prop and object detection.
- Recurring object tracking.
- First mention.
- Last mention.
- Scene appearances.
- Object ownership/association.
- Production category suggestions.
- Continuity notes.

### Deliverable

SCS can automatically generate and maintain a connected database of characters, locations, objects, props, and recurring story elements.

---

## Phase 5 — Compiler and Generated Breakdowns

### Goals

Create the SCS compiler: a deterministic analysis engine that turns screenplay content into useful creative and production reports.

### Core Tasks

- Generate scene breakdowns.
- Generate character breakdowns.
- Generate object/prop breakdowns.
- Generate location breakdowns.
- Generate dialogue statistics.
- Generate scene length estimates.
- Generate page count estimates.
- Generate act and sequence summaries.
- Generate episode summaries for television.
- Generate production category reports.
- Generate revision summaries.
- Export breakdowns to Markdown, CSV, JSON, and PDF.

### Creative Breakdowns

- Scene list.
- Act structure.
- Sequence structure.
- Beat map.
- Character arcs.
- Plot thread tracking.
- Treatment-to-script coverage.
- Missing or unresolved beats.
- Dialogue density.
- Pacing warnings.

### Production Breakdowns

- Cast.
- Locations.
- Props.
- Vehicles.
- Animals.
- Weapons.
- Stunts.
- VFX.
- SFX.
- Wardrobe references.
- Makeup references.
- Night scenes.
- Crowd scenes.
- High-complexity scenes.

### Deliverable

Users can compile a script and receive generated reports useful for rewriting, development, and production planning.

---

## Phase 6 — Writer-Friendly Version Control

### Goals

Add Git-style version control without exposing unnecessary Git complexity to writers.

### Core Tasks

- Add project snapshot history.
- Add named versions.
- Add version descriptions.
- Add draft milestones.
- Add restore previous version.
- Add compare versions.
- Add scene-level diffing.
- Add dialogue-level diffing.
- Add treatment diffing.
- Add metadata diffing.
- Add Git-backed storage internally or optionally.
- Add branch support for alternate drafts.
- Add merge support for draft branches.
- Add conflict resolution UI for screenplay changes.

### Writer-Friendly Terminology

- Commit → Save Draft Version
- Branch → Alternate Draft
- Merge → Combine Drafts
- Diff → Compare Drafts
- Tag → Milestone
- Checkout → Restore Version
- Repository → Project History

### Diff Views

- Script page diff.
- Scene diff.
- Dialogue-only diff.
- Structure diff.
- Character diff.
- Object/prop diff.
- Treatment diff.
- Episode diff.
- Season diff.

### Television Versioning

- Version a single episode.
- Version a whole season.
- Version the shared show bible.
- Compare drafts of one episode.
- Compare continuity changes across multiple episodes.

### Deliverable

SCS becomes a true version-controlled writing environment for film and television development.

---

## Phase 7 — Advanced Television Workspace

### Goals

Make SCS a serious tool for series development, not just feature scripts.

### Core Tasks

- Add full show workspace mode.
- Add seasons.
- Add episodes.
- Add episode tabs.
- Add persistent reference panels.
- Add show bible editor.
- Add season board.
- Add episode board.
- Add A/B/C story tracking.
- Add cold open and tag support.
- Add act break tracking.
- Add show-level character arcs.
- Add recurring object tracking across episodes.
- Add recurring location tracking across episodes.
- Add season timeline.
- Add continuity database.
- Add plot thread tracker.
- Add unanswered question tracker.
- Add episode comparison tools.

### Television Reference Features

When writing an episode, users should be able to quickly reference:

- Previous episode script.
- Next episode outline.
- Character sheet.
- Object sheet.
- Location sheet.
- Show bible.
- Season arc.
- Plot thread history.
- Timeline continuity.
- All scenes involving a specific character.
- All previous mentions of a specific object.

### Episode Tabs

The main writing UI should support tabs such as:

```text
Pilot | Episode 2 | Episode 3 | Episode 4 | Finale
```

Each tab should maintain its own editor state, scene board, notes, and breakdowns while still connecting to the shared show database.

### Deliverable

SCS supports full television development workflows across episodes, seasons, and show-level continuity.

---

## Phase 8 — Professional Revision and Production Tools

### Goals

Add the production-facing features expected from professional screenplay software.

### Core Tasks

- Add scene numbers.
- Add page locking.
- Add revision tracking.
- Add colored revisions.
- Add revision pages.
- Add locked pages.
- Add omitted scenes.
- Add production draft labels.
- Add revision history reports.
- Add exportable production breakdowns.
- Add department-specific breakdown reports.
- Add shooting complexity scoring.

### Production-Facing Features

- Cast list.
- One-liner scene list.
- Location report.
- Props report.
- Object continuity report.
- Revision report.
- Character sides.
- Scene sides.
- Dialogue-only exports.
- Department-specific notes.

### Deliverable

SCS becomes viable not only for development, but also for pre-production and production revision workflows.

---

## Phase 9 — Multi-Panel Workspace and Custom Layouts

### Goals

Create the powerful multi-panel workspace that makes SCS feel like a true creative IDE.

### Core Tasks

- Add dockable panels.
- Add split-screen layouts.
- Add saved workspace layouts.
- Add floating panels.
- Add tab groups.
- Add synchronized panels.
- Add project-wide search.
- Add command palette.
- Add keyboard shortcut customization.

### Example Layouts

#### Writer Mode

- Main screenplay editor.
- Scene navigator.
- Notes panel.

#### Development Mode

- Beat board.
- Treatment editor.
- Character sheet.
- Scene list.

#### Revision Mode

- Current draft.
- Previous draft.
- Diff panel.
- Version history.

#### Television Mode

- Current episode.
- Previous episode reference tab.
- Show bible.
- Season arc board.
- Continuity panel.

#### Production Mode

- Script.
- Breakdown report.
- Character/object/location lists.
- Revision tracker.

### Deliverable

Users can build custom creative workspaces for writing, development, revision, production, and television continuity.

---

## Phase 10 — External Tool Compatibility and Companion Mode

### Goals

Allow SCS to work alongside existing tools rather than forcing users to abandon their current workflow.

### Core Tasks

- Add linked FDX files.
- Add watch-folder support.
- Detect external file changes.
- Re-import changed FDX files.
- Preserve SCS metadata when the linked screenplay changes externally.
- Add conflict detection when both SCS and an external editor change the file.
- Add external editor handoff.
- Add companion dashboard mode.

### Companion Mode

SCS can be used next to Final Draft or another FDX editor. In this mode, SCS handles:

- Beat boards.
- Treatments.
- Character sheets.
- Object sheets.
- Version history.
- Breakdowns.
- Scene tracking.
- Television continuity.

The user can continue writing in another application while SCS watches and updates the development database.

### Deliverable

SCS becomes safe and attractive for writers who already rely on Final Draft or other FDX-based workflows.

---

## Phase 11 — Collaboration and Sync

### Goals

Add optional collaboration while preserving local-first ownership.

### Core Tasks

- Add optional cloud sync.
- Add Git remote sync.
- Add shared project access.
- Add user roles.
- Add comments.
- Add suggested changes.
- Add draft approvals.
- Add writer room mode.
- Add conflict resolution for collaborators.

### Roles

- Owner.
- Writer.
- Co-writer.
- Director.
- Producer.
- Story editor.
- Script coordinator.
- Reader.
- Viewer.

### Deliverable

Teams can collaborate on SCS projects while still maintaining clean version history and structured development data.

---

## Phase 12 — Optional AI-Assisted Development

### Goals

Add optional AI features without making the app dependent on AI.

### Core Tasks

- Add opt-in local or API-based AI tools.
- Generate scene summaries.
- Generate treatment drafts from scene cards.
- Generate character summaries.
- Suggest missing beat coverage.
- Suggest continuity issues.
- Generate pitch summaries.
- Generate coverage-style notes.
- Generate production risk notes.
- Generate rewrite task lists.

### Important Constraint

The core SCS compiler should remain deterministic and usable without AI. AI should enhance the workflow, not replace the core engine.

### Deliverable

SCS can optionally assist writers with notes, summaries, coverage, and analysis while preserving privacy and control.

---

## Initial MVP Recommendation

The first public MVP should focus on the strongest adoption wedge:

**Open an FDX file and instantly get a better development workspace than Final Draft.**

### MVP Scope

- Open FDX.
- Parse scenes.
- Display formatted script.
- Generate scene list.
- Generate character list.
- Generate location list.
- Add basic object recognition.
- Add act/sequence/scene/beat hierarchy.
- Add scene cards.
- Add basic treatment docs.
- Add character sheets.
- Add object sheets.
- Add local snapshot versions.
- Add episode tabs for TV projects.
- Add basic show bible.
- Export basic breakdown reports.

### What the MVP Should Not Try to Do Yet

- Perfect Final Draft replacement.
- Full production revisions.
- Real-time collaboration.
- Cloud sync.
- Perfect pagination.
- AI-heavy features.
- Full Git merge complexity.

---

## Long-Term Vision

SCS should become the ultimate development tool for film and television: a local-first creative workspace where writers can write scripts, design story structure, manage treatments, track characters and objects, compare drafts, develop television seasons, generate breakdowns, and preserve the complete creative history of a project.

The goal is not simply to replace Final Draft.

The goal is to replace the messy combination of Final Draft, Google Docs, Notion, Milanote, Trello, Dropbox, spreadsheets, PDFs, and endless files named `Final_Draft_REAL_FINAL_v12.fdx`.
