/**
 * Shared lifecycle vocabulary for the SCS foundation.
 *
 * Everything in Phase 0 is either `active` (wired up and running),
 * `drafted` (modelled and documented, but not yet behaviour) or
 * `planned` (named so the architecture leaves room for it).
 *
 * Using one vocabulary across the UI, the docs and the Rust layer keeps the
 * product honest about what exists today versus what is still on the roadmap.
 */
export type FoundationStatus = "active" | "drafted" | "planned";

/** Human-readable label for a {@link FoundationStatus}. */
export const statusLabels: Record<FoundationStatus, string> = {
  active: "Active",
  drafted: "Drafted",
  planned: "Planned",
};
