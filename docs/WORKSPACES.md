# Workspaces, Search, and Shortcuts

The workspace renderer uses each saved layout's real panel topology. **Layouts** can add or remove screenplay, navigator, Inspector, Story, Treatment, Breakdown, Versions, Series, Production, and reference panels; place them into independently selectable tab groups; reorder groups; split horizontally or vertically; and float a panel in a saved frame. Built-in presets remain immutable and can be duplicated into fully editable custom layouts.

| Preset | Primary workflow | Persistent reference |
|---|---|---|
| Writer | Script, scene navigator, focused Inspector | None |
| Development | Screenplay plus Story/Treatment/Breakdown tab group | Any custom reference after duplication |
| Revision | Current draft, previous draft, readable diffs, versions | Previous draft |
| Television | Episode, Series/continuity tools, episode tabs | Previous episode |
| Production | Script plus Breakdown/Production tab group | Any custom reference after duplication |
| Companion | Watched FDX dashboard and development Inspector | None |

Reference panels persist independently, so one workspace can keep several sources visible or tabbed. Sources include previous episode, next-episode outline, previous draft, targeted character/object/location sheets, show bible, season arc, plot history, and timeline continuity. Character panels list all matching scenes, while object panels list prior mentions. Layout target selectors are populated from the current project when a matching entity exists.

The navigator and screenplay/reference views share the active selection. Panel membership, tab ownership, split ratios/direction, floating frames, synchronized groups, reference sources, and targets are validated before a custom layout is saved. Older navigator/Inspector/reference-only layouts upgrade automatically, while malformed topology is rejected rather than installed.

The command palette searches every episode's headings and screenplay text, detected characters and objects, treatments, show-bible/season text, saved draft versions, and workspace layouts. Search navigation remains available to read-only roles; actions that restore a version or edit a layout remain disabled.

Default shortcuts are `Mod+K` for the command palette, `Mod+S` for local recovery save, and `Mod+Shift+S` for Save Draft Version. **Layouts** can assign or clear shortcuts for the palette, save, version save, Inspector toggle, layout manager, and previous/next episode. `Mod` maps to Command on macOS and Control elsewhere. Collisions are rejected and the saved bindings drive runtime behavior immediately.
