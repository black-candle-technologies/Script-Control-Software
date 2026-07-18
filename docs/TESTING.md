# Testing

Run the frontend checks with `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`. Playwright starts an isolated Vite server and verifies screenplay editing/source round trips, collaboration and manual-prop surfaces, television episode/scoped-history workflows, and a persisted custom split/reference layout in Chromium. CI installs the matching Chromium build before this suite. Run Rust checks with `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `cargo check --manifest-path src-tauri/Cargo.toml`.

Synthetic, non-copyrighted FDX fixtures live in `src-tauri/test-fixtures/`. They cover minimal and feature scripts, styles, scene numbers, character extensions, unusual headings, unknown types, empty scripts, malformed XML, and two television episodes.

## Release smoke test

Before a release:

1. Open the sample, edit formatted text, edit Fountain source, save local recovery, reload, and confirm both edits render.
2. Save and reopen a portable feature project and a two-episode television project.
3. Exercise Writer, Development, Revision, Television, Production, and Companion presets; save/reload one custom floating layout and shortcut.
4. Import/export the FDX fixtures, watch a folder, modify a linked fixture externally, and verify the conflict/re-import choices preserve development metadata.
5. Add a Reader and Producer. Submit/accept a scoped suggestion, approve an existing Draft Version, synchronize a writer-room scene/task, then verify a Viewer cannot edit, restore a draft, open Layout Manager, or change sync settings.

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

Browser acceptance is run with the Playwright CLI against the Vite app. Native file dialogs, external handoff, portable writes, and Git commands require the Tauri build or their Rust integration tests; a web-only session cannot prove those OS boundaries.
