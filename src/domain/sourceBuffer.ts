export interface FountainSourceReconciliationInput {
  documentId: string;
  baseText: string;
  localText: string;
  acceptedText: string;
  acceptedRevision: number;
}

export type FountainSourceReconciliation =
  | { kind: "unchanged"; documentId: string; baseText: string; localText: string }
  | { kind: "rebased"; documentId: string; baseText: string; localText: string }
  | { kind: "converged"; documentId: string; baseText: string; localText: string }
  | { kind: "conflict"; documentId: string; baseText: string; localText: string; acceptedText: string; acceptedRevision: number };

/**
 * Reconciles a window-local Fountain buffer with the newest authoritative
 * screenplay projection. It never guesses a merge between two edited texts.
 */
export function reconcileFountainSourceBuffer(input: FountainSourceReconciliationInput): FountainSourceReconciliation {
  if (input.acceptedText === input.baseText) {
    return { kind: "unchanged", documentId: input.documentId, baseText: input.baseText, localText: input.localText };
  }
  if (input.localText === input.baseText) {
    return { kind: "rebased", documentId: input.documentId, baseText: input.acceptedText, localText: input.acceptedText };
  }
  if (input.localText === input.acceptedText) {
    return { kind: "converged", documentId: input.documentId, baseText: input.acceptedText, localText: input.acceptedText };
  }
  return {
    kind: "conflict",
    documentId: input.documentId,
    baseText: input.baseText,
    localText: input.localText,
    acceptedText: input.acceptedText,
    acceptedRevision: input.acceptedRevision,
  };
}
