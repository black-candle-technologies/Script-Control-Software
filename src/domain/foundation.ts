import type { FoundationStatus } from "./status.ts";

/**
 * The architecture / status signals shown on the dashboard.
 *
 * This list is the single source of truth for "what is real today". It is kept
 * deliberately honest: the runtime stack is `active`, the data shapes are
 * `drafted`, and the storage choices are `planned`.
 */
export interface FoundationSignal {
  id: string;
  label: string;
  status: FoundationStatus;
  /** One line of context for the status. */
  detail: string;
}

export const foundationSignals: FoundationSignal[] = [
  {
    id: "tauri",
    label: "Tauri shell",
    status: "active",
    detail: "Native desktop window and Rust ↔ frontend command bridge are running.",
  },
  {
    id: "frontend",
    label: "React / TypeScript frontend",
    status: "active",
    detail: "The dashboard renders from typed domain models.",
  },
  {
    id: "backend",
    label: "Rust backend",
    status: "active",
    detail: "Command layer exposes app metadata and will own parsing and storage.",
  },
  {
    id: "project-format",
    label: "Project format",
    status: "drafted",
    detail: "The portable .scs folder layout is specified in docs/PROJECT_FORMAT.md.",
  },
  {
    id: "domain-models",
    label: "Domain models",
    status: "drafted",
    detail: "Hierarchy, television, recognition and versioning shapes are modelled in src/domain.",
  },
  {
    id: "sqlite",
    label: "SQLite index",
    status: "planned",
    detail: "A local database for fast indexing and search of structured story data.",
  },
  {
    id: "json-portability",
    label: "JSON portability",
    status: "planned",
    detail: "JSON export so projects are never trapped away from FDX-compatible tools.",
  },
];
