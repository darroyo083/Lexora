package com.lexora.correction.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Per-item view of an AnswerKeyEntry associated with one page interaction.
 * When the source entry carries multiple items, the view holds items[i] as
 * expectedValue with empty alternatives; single-item entries keep their
 * original expectedValue, alternatives and typedPayload. pageNumber remains
 * source evidence (Lösungen page), never exercise identity.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ResolvedAnswerEntry(
    int pageNumber,
    String exerciseNumber,
    Integer unitNumber,
    String subExerciseMarker,
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
    TypedPayload typedPayload,
    Integer itemIndex
) {
    public ResolvedAnswerEntry {
        alternatives = alternatives == null ? List.of() : List.copyOf(alternatives);
        mappingWarnings = mappingWarnings == null ? List.of() : List.copyOf(mappingWarnings);
        normalizationMode = normalizationMode == null ? "strict" : normalizationMode;
        rawSolutionText = rawSolutionText == null ? "" : rawSolutionText;
    }

    public static ResolvedAnswerEntry single(AnswerKeyEntry entry) {
        return new ResolvedAnswerEntry(
            entry.pageNumber(), entry.exerciseNumber(), entry.unitNumber(),
            entry.subExerciseMarker(), entry.interactionKind(), entry.ordinal(),
            entry.expectedValue(), entry.alternatives(), entry.caseSensitive(),
            entry.punctuationRequired(), entry.normalizationMode(), entry.rawSolutionText(),
            entry.confidence(), entry.mappingWarnings(), entry.typedPayload(), null);
    }

    public static ResolvedAnswerEntry item(AnswerKeyEntry entry, int index) {
        return new ResolvedAnswerEntry(
            entry.pageNumber(), entry.exerciseNumber(), entry.unitNumber(),
            entry.subExerciseMarker(), entry.interactionKind(), entry.ordinal(),
            entry.items().get(index), List.of(), entry.caseSensitive(),
            entry.punctuationRequired(), entry.normalizationMode(), entry.rawSolutionText(),
            entry.confidence(), entry.mappingWarnings(), entry.typedPayload(), index);
    }
}
