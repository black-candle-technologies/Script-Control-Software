# Testing

## Complete repository gate

Use the locked dependency graph and run every required command independently. `pnpm check` already combines TypeScript compilation with the Node domain tests, and `pnpm lint` is a second no-emit TypeScript pass; both are retained in the release gate intentionally.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e

cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

pnpm build
```

Also attempt the native bundle:

```sh
pnpm tauri build --debug
```

The CI workflow currently installs frozen pnpm dependencies and Chromium, then runs `pnpm check`, Playwright, Rust format/clippy/tests, and `pnpm build`. The fuller local gate above additionally makes the no-emit TypeScript, standalone Node-test, and `cargo check` results explicit.

## Focused automated coverage

The Node domain tests cover exact `ScriptTarget` offsets and same-block stale fallback, object/character/location/production provenance, visual-board before/after/append/empty/unassigned placement, selected/active/unassigned beat targets, document-tab view/removal semantics, protected Fountain-buffer reconciliation, deferred-save metadata, UI-preference and recovery migration, nested dock-tree validation/migration/operations, session revisions/bootstrap/actor permissions, native window registry rules, acknowledged cross-window transfers, and canonical brand geometry.

Playwright starts an isolated Vite server in Chromium. Focused specs cover Breakdown disclosure defaults/bulk actions/persistence and exact navigation, Visual Board placement and keyboard/context/beat flows, the Write tree hierarchy, and BrandMark bounds/optical centering at small and large sizes, zoom, and themes. Browser tests can exercise the React fallback and pure UI contract; they do not create Tauri OS windows.

Rust tests cover the FDX parser, realistic title-page preservation, malformed XML tolerance, window labels/registry/leader promotion/geometry, drag revision/acknowledgement/cancellation, coordinator reconciliation/idempotency/permissions/save ordering, project-file recovery, external-file confinement, and Git hardening. Synthetic, non-copyrighted FDX fixtures live in `src-tauri/test-fixtures/`, including `title-page-rich.fdx`, styles, scene numbers, character extensions, unusual headings, unknown types, empty scripts, malformed XML, and two television episodes.

## Browser interaction smoke

Before release, verify in both light and dark themes and at non-default browser zoom:

1. Edit formatted text and Fountain Source, undo/redo per document, save emergency recovery, reload, and confirm both views render. In two native windows, make competing Source/formatted edits and verify tab/view/window exit waits for acknowledgement, presents both versions on rejection, and protects a downloadable local buffer if the document is removed remotely.
2. Use generic tabs in feature and television projects. Confirm **Close view** keeps the screenplay, while **Remove from project…** requires permission/confirmation and creates a recovery snapshot.
3. Collapse individual Breakdown sections, use **Expand All**, **Collapse All**, and **Reset Sections**, reload, and confirm project/document scoping.
4. Open the second of repeated object mentions, a character dialogue line, a location appearance, production evidence, an import warning, and a result in another screenplay. Confirm exact ranges/document activation, then make stored offsets stale and verify same-block, block, and scene fallbacks never jump globally.
5. Exercise Visual Board before/after/empty/unassigned previews, keyboard move commands, double-click selection, new-beat target display, beat edit save/cancel, and the pointer/keyboard scene menu. Confirm the draft order changes only after **Make Draft Match Outline**.
6. Traverse the Write tree through an act with one sequence, empty act/sequence, scene beats, and empty Unassigned branch using arrows, Home/End, Enter, and Space.
7. Apply every built-in layout; save/update/duplicate/rename/delete a custom nested layout; assign its shortcut; hide/restore a panel; move/resize a logical float; inject malformed topology and confirm Writer-centered recovery.
8. Import `src-tauri/test-fixtures/title-page-rich.fdx`, inspect/edit its canonical and custom fields, export/re-import FDX, and review Fountain conversion warnings.

## Required native Tauri smoke test

This is a manual release checklist, not an automated test result. Run it in a GUI-capable desktop environment using `pnpm tauri dev` or the debug bundle, record the OS/display setup and outcome, and report any skipped step. This document does **not** claim that the checklist has been performed merely because unit, Chromium, or build commands passed.

1. Open a multi-document project.
2. Edit two screenplay documents in separate tabs and confirm their editor/undo state remains independent.
3. Open a second native window from **Window → New Window** or **Open current screenplay in New Window**. Confirm its generated label is capability-safe and the Window menu lists one leader.
4. Move a document tab into the second window. Confirm closing the source view does not remove the screenplay from the project.
5. Move a registered panel between windows, then repeat with copy for a copyable panel and with the Window-menu non-drag command.
6. Confirm the source ghost and destination placeholder are both visible before the drop is acknowledged. Cancel once, close a destination during another attempt, and confirm the source remains unchanged.
7. Edit in one window and verify the other receives the accepted next revision. Exercise different-block edits, then a same-block stale conflict and snapshot recovery; verify no echo loop or duplicate application.
8. Save from one window while the other remains open. Confirm the leader serializes recovery/portable intents and a secondary window does not create a competing write.
9. Close the primary/leader window first. Confirm the oldest survivor becomes leader, remains functional, can edit/save, and the application does not exit.
10. Close the final window through its confirmation/recovery path, reopen the application, and verify project-scoped recovery plus any enabled window placement restoration.
11. Disconnect a saved monitor or simulate an off-screen rectangle. Reopen or supply that geometry and verify it is clamped to a connected display and minimum size; also exercise **Reset Window Placement** and **Restore off-screen panels**.
12. Import `src-tauri/test-fixtures/title-page-rich.fdx`, save and reopen the project, export FDX, and re-import it. Verify canonical fields, order, duplicate/custom/untyped and empty paragraphs, multiline text, supported runs/attributes, and any explicit conversion warnings.
13. Repeat content, document-removal, layout-save, board, context-menu, and secondary-window mutation attempts under a read-only role. Viewing/navigation may remain available, but no native-window or context-menu path may bypass project permissions.

Also verify that Visual Board dragging still works with Tauri `dragDropEnabled: false`; cross-window transport must use the validated internal protocol, not the OS file-drop handler, clipboard, or filesystem.

### What automated tests cannot prove

Chromium Playwright cannot prove Tauri window creation/focus/close behavior, WebView capability assignment, native event routing, source/destination previews in two OS windows, monitor enumeration, native dialogs, portable filesystem replacement, default external-app handoff, or Git subprocess confinement. Rust tests strongly cover the underlying coordinator/window/parser/file rules but do not render WebViews or exercise a real window manager. If the environment has no GUI or required bundler prerequisites, report the native smoke and/or `tauri build` step as **not run** with the exact limitation; do not infer a pass.

## Two-collaborator shared-folder test

Use two copied application recovery profiles or two computers pointing at the same provider-synced `scs.project.json`:

1. Both users open the same saved timestamp.
2. Add independent comments/tasks on both sides; save A, then sync B. Both records must survive automatically.
3. Edit the same screenplay block differently; save A, then sync B. The Team panel must show the exact conflict path and both values.
4. Choose different sources for at least two conflicts and apply. Reopen the file and verify both choices plus **Before shared collaboration merge** and **Shared collaboration merge** history entries.
5. Repeat after opening the same shared file under different absolute mount paths. Each app must write only its opened path.
6. Restart B with unsaved recovery state after A changes the shared file. SCS must require a whole-project choice instead of claiming an unsafe automatic merge.

## Git sync test

Use a disposable private HTTPS remote and two clones. Never use a production screenplay.

1. Initialize, save a sync point, and push clone A.
2. Pull clone B, change the project, save a sync point, and push; pull A.
3. Leave an uncommitted file and confirm pull/push stop before network mutation.
4. Commit independently in both clones and confirm the non-fast-forward divergence stops safely without force or automatic history rewriting.
5. Configure a repository hook, signing, filter process, local `credential.helper`, `core.askPass`, `core.sshCommand`, and inherited `GIT_DIR` one at a time; SCS must disable/reject them without running a sentinel command and keep operations confined to the selected project.
6. Remove credentials and verify an authentication error returns without an interactive prompt or indefinite hang.
