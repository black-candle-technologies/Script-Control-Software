# Contributing

Install Node 22+, pnpm 10, Rust stable, and the platform prerequisites for Tauri 2.

```sh
pnpm install
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

Keep projects portable: screenplay text belongs in FDX/Fountain, development metadata in `scs.project.json`, and rebuildable data under `.scs/`. Add one focused test for non-trivial behavior.
