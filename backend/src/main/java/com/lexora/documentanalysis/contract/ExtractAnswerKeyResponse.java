package com.lexora.documentanalysis.contract;

import com.lexora.correction.domain.AnswerKeyEntry;

import java.util.List;

public record ExtractAnswerKeyResponse(
    String bookId,
    String extractionMethod,
    String parserVersion,
    String sourcePageRange,
    List<AnswerKeyEntry> entries,
    int entryCount
) {
    public ExtractAnswerKeyResponse {
        entries = entries == null ? List.of() : List.copyOf(entries);
    }
}
