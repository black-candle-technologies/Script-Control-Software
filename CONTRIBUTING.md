# Contributing

Install Node 22+, pnpm 10, Rust stable, and the platform prerequisites for Tauri 2.

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

For release-affecting native work, also attempt `pnpm tauri build --debug` and record the manual Tauri smoke-test result from `docs/TESTING.md`; browser Playwright does not prove OS windows, capabilities, file dialogs, monitor recovery, or external handoff.

Keep projects portable: screenplay text and rich title data belong in the document/FDX/Fountain model, shared development metadata and logical layouts in `scs.project.json`, machine/window view state in versioned local preferences, and rebuildable data under `.scs/`. Add focused domain/Rust coverage for non-trivial transformations and focused Playwright coverage for user-visible interaction.
