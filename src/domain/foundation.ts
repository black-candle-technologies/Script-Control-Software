import type { FoundationStatus } from "./status.ts";

/**
 * The architecture / status signals shown on the dashboard.
 *
 * This list is the single source of truth for "what is real today". It is kept
 * deliberately honest about capabilities that are active or optional.
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
    status: "active",
    detail: "Portable project folders round-trip documents, versions, metadata and Fountain scripts.",
  },
  {
    id: "domain-models",
    label: "Domain models",
    status: "active",
    detail: "Hierarchy, television, recognition, compiler and versioning behavior is active.",
  },
  {
    id: "sqlite",
    label: "SQLite index",
    status: "planned",
    detail: "Optional future index; current in-memory project search needs no database.",
  },
  {
    id: "json-portability",
    label: "JSON portability",
    status: "active",
    detail: "Portable project metadata and breakdown reports export as JSON.",
  },
];
