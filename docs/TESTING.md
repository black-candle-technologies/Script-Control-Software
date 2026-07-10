# Testing

Run the frontend checks with `pnpm check`, `pnpm lint`, `pnpm test`, and `pnpm build`. Run Rust checks with `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `cargo check --manifest-path src-tauri/Cargo.toml`.

Synthetic, non-copyrighted FDX fixtures live in `src-tauri/test-fixtures/`. They cover minimal and feature scripts, styles, scene numbers, character extensions, unusual headings, unknown types, empty scripts, malformed XML, and two television episodes.
