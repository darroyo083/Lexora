package com.lexora.correction.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AnswerKeyEntry(
    int pageNumber,
    String exerciseNumber,
    String interactionKind,
    int ordinal,
    String expectedValue,
    List<String> alternatives,
    boolean caseSensitive,
    boolean punctuationRequired,
    String normalizationMode,
    String rawSolutionText,
    double confidence,
    List<String> mappingWarnings,
    TypedPayload typedPayload
) {
    public AnswerKeyEntry {
        alternatives = alternatives == null ? List.of() : List.copyOf(alternatives);
        mappingWarnings = mappingWarnings == null ? List.of() : List.copyOf(mappingWarnings);
        normalizationMode = normalizationMode == null ? "strict" : normalizationMode;
        rawSolutionText = rawSolutionText == null ? "" : rawSolutionText;
    }
}
