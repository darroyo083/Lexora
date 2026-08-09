package com.lexora.correction.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AnswerKey(
    UUID bookId,
    String extractionMethod,
    String parserVersion,
    String sourcePageRange,
    ExtractionStatus extractionStatus,
    String failureReason,
    Instant extractedAt,
    List<AnswerKeyEntry> entries,
    Instant createdAt,
    Instant updatedAt
) {
    public AnswerKey {
        entries = entries == null ? List.of() : List.copyOf(entries);
    }

    public int entryCount() {
        return entries.size();
    }
}
