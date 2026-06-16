/**
 * Recognition model placeholders.
 *
 * A future SCS compiler will scan the screenplay and surface the entities moving
 * through the story: characters, props/objects, locations and recurring motifs.
 * Recognition is deterministic (no AI required) and always keeps the writer in
 * control — every detection is a *candidate* until confirmed.
 *
 * Phase 0 models the shapes only; no recognition logic exists yet.
 * See also: docs/DOMAIN_MODELS.md.
 */

/** The kinds of entity the recognition layer will detect. */
export type EntityKind = "character" | "object" | "location" | "motif";

/** Where a confirmed entity sits in the writer's confirmation workflow. */
export type ConfirmationStatus = "detected" | "confirmed" | "rejected" | "merged";

export interface Character {
  id: string;
  name: string;
  /** Other names/spellings that refer to the same character. */
  aliases: string[];
  status: ConfirmationStatus;
}

export interface PropObject {
  id: string;
  name: string;
  /** Loose production category, e.g. "weapon", "vehicle", "document". */
  category?: string;
  status: ConfirmationStatus;
}

export interface Location {
  id: string;
  name: string;
  /** INT / EXT, when known from the scene heading. */
  interiorExterior?: "INT" | "EXT" | "INT/EXT";
  status: ConfirmationStatus;
}

/** A recurring image, phrase or symbolic element the writer wants to track. */
export interface Motif {
  id: string;
  label: string;
  status: ConfirmationStatus;
}

/**
 * A single detection awaiting the writer's decision. The recognition engine
 * proposes these; the writer confirms, rejects, renames or merges them.
 */
export interface RecognitionCandidate {
  id: string;
  kind: EntityKind;
  /** The text the engine matched (e.g. a character cue or a prop noun phrase). */
  rawText: string;
  /** Confidence in the range 0–1. Surfaced so writers can sort and triage. */
  confidence: number;
  /** Existing entities this candidate might be the same as. */
  mergeCandidates: MergeCandidate[];
}

/** A suggestion that two entities are the same and could be merged. */
export interface MergeCandidate {
  /** The existing entity this candidate may duplicate. */
  entityId: string;
  /** Why the engine thinks they match (e.g. "shared alias", "same scenes"). */
  reason: string;
  /** Confidence in the range 0–1. */
  confidence: number;
}
