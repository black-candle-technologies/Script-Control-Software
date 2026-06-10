# Script Control Software (SCS)

**Script Control Software**, also known as **SCS**, is a planned professional screenwriting and story development application for film and television. It is designed to be a local-first desktop tool that supports `.fdx` files while expanding far beyond traditional screenwriting software with beat boarding, treatment documentation, character and object recognition, Git-style version control, generated script breakdowns, television season workspaces, and a more powerful multi-panel writing environment.

SCS is intended to feel familiar to writers who already use industry-standard screenplay tools while offering a deeper, more modern development system for serious filmmakers, showrunners, story editors, producers, and development teams.

The basic idea is simple:

> SCS should do what Final Draft does, but with real story architecture, version control, development documentation, recognition intelligence, and television continuity built in from the beginning.

---

## Core Vision

Most screenwriting applications focus almost entirely on the screenplay page. They help format a script correctly, export a PDF, and maybe provide some basic beat board or revision tools. That is useful, but it does not reflect how stories are actually developed.

A film or television project is more than pages. It includes outlines, treatments, character sheets, object tracking, plot threads, scene cards, alternate drafts, revisions, production considerations, notes, show bibles, season arcs, and creative decisions that evolve over time.

SCS is designed around the idea that the script should be the center of a connected development workspace.

Instead of treating a screenplay as plain text, SCS should understand it as structured creative data:

- Acts
- Sequences
- Scenes
- Beats
- Characters
- Dialogue
- Locations
- Objects and props
- Recurring motifs
- Treatments
- Notes
- Draft history
- Episode continuity
- Production elements

The goal is to give writers and filmmakers a tool that can manage the entire life of a project from early concept to production draft.

---

## Intended Users

SCS is being designed for:

- Screenwriters
- Writer/directors
- Indie filmmakers
- Television writers
- Showrunners
- Story editors
- Script coordinators
- Producers
- Development teams
- Film students
- Small production companies

The first ideal users are likely independent filmmakers and small development teams who need more than a screenplay formatter but do not want to manage their project across ten disconnected tools.

---

## FDX Compatibility

A major goal of SCS is strong compatibility with `.fdx` files.

The software should eventually allow users to:

- Open `.fdx` files directly.
- Edit `.fdx` screenplay content.
- Export clean `.fdx` files.
- Preserve as much formatting and structure as possible.
- Use existing Final Draft files inside an SCS project.
- Work alongside Final Draft or other FDX-compatible tools.
- Keep SCS-specific metadata separate from the core screenplay file where possible.

SCS should not trap writers in an isolated format. Writers should be able to use it as a better development layer around files and workflows they already have.

---

## Professional Screenplay Writing

SCS is intended to include a full screenplay editor with professional formatting behavior.

Planned screenplay features include:

- Scene headings
- Action lines
- Character names
- Dialogue
- Parentheticals
- Transitions
- Shots
- Dual dialogue
- Continued dialogue
- Title pages
- Headers and footers
- Page breaks
- Page locking
- Scene numbers
- Revision tracking
- Colored revision pages
- Production drafts
- PDF export
- FDX import/export
- Fountain export
- Keyboard shortcuts familiar to screenwriters
- Character and location auto-complete
- Industry-standard screenplay margins and formatting

The long-term goal is for writers to be able to write directly in SCS without feeling like they are giving up the professional expectations of traditional screenwriting software.

---

## Story Hierarchy: Acts, Sequences, Scenes, Beats, and Moments

One of the major design goals of SCS is to avoid the flat beat-board model used by many existing tools.

SCS should distinguish between different levels of story structure:

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

This means a user should be able to develop a story from the top down or bottom up.

They may start with acts, then break those acts into sequences, then develop scenes, then refine beats inside each scene. Or they may start with a messy board of ideas and gradually organize those cards into a stronger structure.

Planned story-structure features include:

- Act boards
- Sequence boards
- Scene boards
- Beat boards
- Optional moment-level planning
- Drag-and-drop story rearrangement
- Multiple structure templates
- Custom structure templates
- Act/sequence/scene/beat linking
- Scene summaries
- Scene notes
- Dramatic purpose fields
- Conflict fields
- Setup/payoff tracking
- Plot thread tracking
- Character arc tracking
- Treatment-to-scene linking

This is intended to make SCS a real story architecture tool, not just a screenplay formatter with sticky notes.

---

## Scene Board and Rearrangement

SCS should include a powerful visual scene board.

Every scene in the screenplay should be represented as a card that can display useful information such as:

- Scene number
- Scene heading
- Location
- Time of day
- Page count
- Characters present
- Objects or props used
- Scene summary
- Act and sequence placement
- Linked beats
- Tags
- Revision status
- Production complexity

Users should be able to rearrange scenes visually and have the screenplay structure update accordingly.

Planned scene views include:

- Vertical scene list
- Card board
- Act view
- Sequence view
- Timeline view
- Location view
- Character POV view
- Production breakdown view

---

## Treatment Documentation

SCS should include rich treatment documentation as a first-class feature.

Treatments should not just be external documents. They should be deeply connected to the script, beat board, and scene structure.

Planned treatment features include:

- Long-form treatment editor
- Markdown-style writing
- Headings and collapsible sections
- Scene links
- Beat links
- Character links
- Object links
- Location links
- Treatment version history
- Treatment/script comparison
- Export to Markdown, PDF, and eventually DOCX
- Ability to generate a treatment from scene summaries
- Ability to see which treatment sections are not represented in the script

The goal is for treatments to become living development documents rather than static files that become outdated once drafting starts.

---

## Character Recognition and Character Sheets

SCS should include integrated character recognition.

The application should be able to scan a screenplay and automatically detect characters from dialogue blocks, descriptions, and repeated references. It should then allow users to confirm, edit, merge, or ignore detected characters.

Planned character features include:

- Automatic character detection
- Character alias detection
- First appearance detection
- Character description detection
- Dialogue count
- Scene count
- First and last appearance
- Character absence gaps
- Character co-appearance tracking
- Character-specific dialogue view
- Character sheets
- Character relationships
- Character arc notes
- Casting ideas
- Costume notes
- Voice notes
- Internal want and external goal fields
- Fear, flaw, need, and arc fields

Character sheets should be connected to the actual script. If a character appears in 35 scenes, the character sheet should know that. If a character disappears for 40 pages, the system should be able to show that. If two characters never share a scene, that should be visible.

---

## Object, Prop, and Recurring Element Recognition

In addition to character recognition, SCS should include object and prop recognition.

The compiler should scan action lines and detect important or recurring objects such as:

- Weapons
- Vehicles
- Documents
- Phones
- Computers
- Books
- Letters
- Photographs
- Rings
- Tapes
- Bags
- Clothing items
- Animals
- Symbolic objects
- Story-specific recurring items

Users should be able to confirm detections and create object sheets.

Planned object-tracking features include:

- Automatic object detection
- Recurring object recognition
- First mention tracking
- Scene appearance tracking
- Character association
- Prop category suggestions
- Object continuity notes
- Production breakdown export
- Object version history

This feature is important because many stories depend on objects moving through the plot. A ring, gun, letter, hard drive, phone, or photograph can carry major story weight. SCS should help writers track that automatically.

---

## Location Recognition and Location Sheets

SCS should parse locations from scene headings and allow users to build location sheets.

Planned location features include:

- Automatic location detection
- INT/EXT tracking
- Time-of-day tracking
- Scene count by location
- Page count by location
- Characters appearing at each location
- Objects appearing at each location
- Location descriptions
- Visual references
- Production notes
- Real-world location ideas
- Location continuity notes

Location tracking should support both creative development and production planning.

---

## Compiler and Generated Breakdowns

One of the central features of SCS is the compiler.

The compiler is a deterministic script analysis engine that reads the structured screenplay data and generates useful breakdowns. It should not require AI to function.

Planned compiler outputs include:

### Story Breakdowns

- Scene list
- Act breakdown
- Sequence breakdown
- Beat map
- Scene summaries
- Plot thread tracking
- Setup/payoff tracking
- Character arc movement
- Treatment/script coverage
- Missing beat warnings
- Pacing indicators

### Character Breakdowns

- Character list
- Dialogue count
- Scene count
- First appearance
- Last appearance
- Character absence gaps
- Character co-appearances
- Character-specific dialogue export

### Object and Prop Breakdowns

- Object list
- First mention
- Scene appearances
- Character association
- Continuity notes
- Production category
- Prop report

### Location Breakdowns

- Location list
- Scene count by location
- Page count by location
- Time-of-day usage
- Characters by location
- Props by location

### Production Breakdowns

- Cast
- Locations
- Props
- Vehicles
- Animals
- Weapons
- Stunts
- VFX
- SFX
- Wardrobe references
- Makeup references
- Night scenes
- Crowd scenes
- High-complexity scenes

### Revision Breakdowns

- Pages changed
- Scenes changed
- Dialogue changed
- Characters added or removed
- Objects added or removed
- Locations added or removed
- Scene order changes
- Episode continuity changes

The compiler should make SCS feel like it understands the script instead of merely displaying it.

---

## Git-Style Version Control

SCS is intended to include proper version control for writing.

This should work like Git conceptually, but with terminology and interfaces built for writers.

Planned version-control features include:

- Save draft versions
- Name versions
- Add version notes
- Create milestones
- Restore old versions
- Compare versions
- Create alternate drafts
- Branch drafts
- Merge draft branches
- View scene-level changes
- View dialogue-level changes
- View treatment changes
- View character/object/location changes
- Track revisions over time
- Optionally connect to a real Git repository later

Writer-friendly terminology should be used wherever possible:

| Git Concept | SCS Term |
|---|---|
| Commit | Save Draft Version |
| Branch | Alternate Draft |
| Merge | Combine Drafts |
| Diff | Compare Drafts |
| Tag | Milestone |
| Checkout | Restore Version |
| Repository | Project History |

The goal is to give writers the power of Git without making the app feel like developer software.

---

## Script Diff Viewer

SCS should eventually include a screenplay-aware diff viewer.

Unlike a normal text diff, this should understand screenplay structure.

It should be able to show:

- Added scenes
- Removed scenes
- Moved scenes
- Changed scene headings
- Added dialogue
- Removed dialogue
- Changed action lines
- Character name changes
- Object changes
- Location changes
- Act/sequence restructuring
- Treatment changes
- Episode continuity changes

Example output:

```text
Scene 14 moved from Sequence 3 to Sequence 2.
Noah's dialogue was reduced by 8 lines.
The old truck was added to the scene.
The location changed from EXT. RIVERBANK - NIGHT to EXT. SAWMILL - NIGHT.
```

This should make revisions easier to understand than raw file comparison.

---

## Television and Series Mode

Television support should be a core feature of SCS, not an afterthought.

SCS should support full show workspaces with this structure:

```text
Show
  Season
    Episode
      Act
        Sequence
          Scene
            Beat
```

A user should be able to keep an entire season inside one SCS project.

Planned television features include:

- Show workspace mode
- Season management
- Episode management
- Episode script tabs
- Episode-specific beat boards
- Episode-specific treatments
- Episode-specific breakdowns
- Shared show bible
- Shared character database
- Shared object database
- Shared location database
- Season arc board
- A/B/C story tracking
- Cold open support
- Tag support
- Act break tracking
- Plot thread tracking across episodes
- Continuity tracking across episodes
- Recurring object tracking
- Recurring character tracking
- Episode comparison tools

The interface should allow users to flip between episodes using tabs, similar to browser tabs:

```text
Pilot | Episode 2 | Episode 3 | Episode 4 | Finale
```

Each episode should maintain its own script and structure while still connecting to the shared show database.

---

## Television Reference Tools

SCS should make it easy to reference previous and future episodes while writing.

When writing an episode, a user should be able to keep open reference panels such as:

- Previous episode script
- Next episode outline
- Show bible
- Season arc board
- Character sheet
- Object sheet
- Location sheet
- Continuity timeline
- Plot thread history
- All scenes involving a specific character
- All mentions of a specific object
- All scenes set in a specific location

This is especially important for serialized television, mystery shows, ensemble dramas, and long-running projects where continuity can become difficult to manage.

SCS should help answer questions like:

- When did this character last appear?
- Which episode introduced this object?
- Has this character already learned this information?
- Where did we last mention this location?
- Which episodes include this plot thread?
- Which scenes involve both of these characters?
- Has this mystery been resolved yet?

---

## Multi-Panel Workspace

SCS should have a powerful multi-panel interface that goes beyond traditional screenwriting software.

Users should be able to create custom layouts for different workflows.

Possible panels include:

- Screenplay editor
- Scene navigator
- Scene board
- Beat board
- Act board
- Sequence board
- Treatment editor
- Character sheet
- Object sheet
- Location sheet
- Notes
- Version history
- Diff viewer
- Compiler breakdowns
- Research board
- Show bible
- Season board
- Episode tabs
- Continuity panel

Possible workspace modes include:

### Writer Mode

A clean screenplay editor with a minimal scene navigator.

### Development Mode

Treatment, beat board, character sheets, and scene structure visible together.

### Revision Mode

Current draft, previous draft, diff viewer, and version history.

### Television Mode

Current episode, other episode tabs, show bible, season arc, and continuity reference panels.

### Production Mode

Script, breakdowns, revision tracker, character/object/location lists, and production reports.

The app should eventually support saved layouts, dockable panels, split-screen writing, and floating reference windows.

---

## Research and Reference System

SCS should include a research system where users can store and organize supporting material.

Planned research features include:

- Notes
- Images
- PDFs
- Links
- Mood boards
- Location references
- Character references
- Historical research
- Thematic references
- Production references
- Link research items to scenes, characters, objects, locations, episodes, or treatments

This would allow SCS to replace scattered research folders and disconnected note apps.

---

## Companion Mode With Final Draft or Other Tools

SCS should eventually support a companion workflow.

In this mode, users could continue writing in Final Draft or another FDX-compatible application while SCS watches the `.fdx` file and updates its development workspace.

Planned companion features include:

- Linked external FDX files
- Watch-folder support
- External change detection
- Re-import changed scripts
- Preserve SCS metadata across imports
- Conflict warnings
- Development dashboard mode

This would make adoption easier because writers would not need to immediately abandon their current software.

---

## Local-First Project Format

SCS should use a local project format that keeps the user in control.

A possible project structure could look like this:

```text
MyProject.scs/
  project.json
  screenplay/
    main.fdx
    main.scs.json
  episodes/
    s01e01/
      episode.fdx
      episode.scs.json
    s01e02/
      episode.fdx
      episode.scs.json
  treatments/
    treatment-v1.md
  boards/
    story-board.json
    season-board.json
  characters/
    characters.json
  objects/
    objects.json
  locations/
    locations.json
  bible/
    show-bible.md
  breakdowns/
    latest.json
  versions/
    history/
```

This structure is only a proposal, but the guiding principle should be portability. Users should not feel like their project is trapped inside a black-box database.

---

## Recommended Technical Stack

The recommended stack for SCS is:

- **Tauri** for the desktop application shell
- **React** for the interface
- **TypeScript** for frontend logic
- **Rust** for file handling, parsing, compiler logic, and performance-sensitive operations
- **SQLite** for local structured data
- **JSON/Markdown** for portable project metadata and documents
- **Git or Git-like storage** for version history

Possible editor frameworks:

- ProseMirror
- TipTap
- Slate
- Lexical

The screenplay editor will likely be one of the hardest parts of the application and should be treated as a core technical challenge.

---

## Legal and Compatibility Notes

SCS should be careful with how it describes compatibility with existing screenwriting software.

Safer language:

- FDX-compatible
- Supports importing and exporting `.fdx` files
- Industry-standard screenplay formatting
- Designed to work with existing screenwriting workflows

Riskier language to avoid:

- Claiming to be Final Draft
- Copying Final Draft branding
- Copying Final Draft’s exact UI
- Using proprietary fonts without proper licensing
- Claiming perfect compatibility before it is proven

SCS should have its own identity while respecting existing file workflows.

---

## MVP Vision

The first useful version of SCS should not try to fully replace Final Draft immediately.

Instead, the MVP should focus on this promise:

> Open an FDX file and instantly get a stronger development workspace.

A strong MVP could include:

- Open FDX
- Parse scenes
- Display script
- Generate scene list
- Generate character list
- Generate location list
- Detect basic objects/props
- Add act/sequence/scene/beat organization
- Add scene cards
- Add treatment documents
- Add character sheets
- Add object sheets
- Add basic breakdown reports
- Add local snapshot versions
- Add TV project mode with episode tabs
- Add basic show bible support

This would already give writers something useful even before SCS becomes a full screenplay editor.

---

## Long-Term Goal

The long-term goal is for SCS to become the ultimate local-first development environment for film and television.

It should combine:

- Screenwriting
- FDX compatibility
- Beat boarding
- Act and sequence design
- Treatment writing
- Character sheets
- Object and prop tracking
- Location tracking
- Television season planning
- Show bibles
- Continuity management
- Git-style version control
- Script-aware diffing
- Generated breakdowns
- Research organization
- Production revision tools

SCS should eventually replace the messy combination of screenplay software, Google Docs, Notion, Milanote, Trello, spreadsheets, random PDFs, and endless duplicate draft files.

The final product should feel like a true creative command center for screenwriters and development teams.
