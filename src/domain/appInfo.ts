/**
 * App identity surfaced by the Rust command layer (`get_app_info`).
 * Field names are snake_case to match the Rust/serde payload exactly.
 */
export interface AppInfo {
  name: string;
  short_name: string;
  version: string;
  phase: string;
  tagline: string;
}

/**
 * Fallback used before the Rust command responds, and when the UI is rendered
 * outside the Tauri shell (e.g. a plain `vite` preview in a browser).
 */
export const defaultAppInfo: AppInfo = {
  name: "Script Control Software",
  short_name: "SCS",
  version: "0.1.0",
  phase: "Phase 0 — Foundation",
  tagline: "A local-first development environment for film and television writing.",
};
