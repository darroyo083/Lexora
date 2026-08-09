package com.lexora.correction.domain;

import java.util.List;
import java.util.UUID;

/**
 * Page-scoped resolution of answer-key entries to the page's interactions.
 * status is RESOLVED | AMBIGUOUS | UNMAPPED; UNMAPPED is a valid answer
 * (no profile, non-exercise page, no entries, or nothing gradable resolved).
 */
public record PageCorrectionResolution(
    UUID bookId,
    int pageNumber,
    String status,
    Integer unitNumber,
    List<CorrectionSlot> slots
) {
    public static final String RESOLVED = "RESOLVED";
    public static final String AMBIGUOUS = "AMBIGUOUS";
    public static final String UNMAPPED = "UNMAPPED";

    public PageCorrectionResolution {
        slots = slots == null ? List.of() : List.copyOf(slots);
    }

    public static PageCorrectionResolution unmapped(UUID bookId, int pageNumber, Integer unitNumber) {
        return new PageCorrectionResolution(bookId, pageNumber, UNMAPPED, unitNumber, List.of());
    }
}
