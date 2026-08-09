package com.lexora.correction.domain;

/**
 * One page interaction of a gradable kind and its authoritative association
 * to an answer-key entry. resolution is RESOLVED | AMBIGUOUS | UNMAPPED;
 * entry is non-null only when RESOLVED.
 */
public record CorrectionSlot(
    String interactionKind,
    int ordinal,
    String resolution,
    ResolvedAnswerEntry entry
) {}
