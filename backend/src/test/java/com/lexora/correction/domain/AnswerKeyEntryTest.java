package com.lexora.correction.domain;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AnswerKeyEntryTest {

    @Test
    void nullAlternativesDefaultToEmptyList() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "test",
            null, false, false, "strict", "", 0.0, null, null);
        assertThat(entry.alternatives()).isEmpty();
    }

    @Test
    void nullMappingWarningsDefaultToEmptyList() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "test",
            List.of(), false, false, null, null, 0.0, null, null);
        assertThat(entry.mappingWarnings()).isEmpty();
    }

    @Test
    void nullNormalizationModeDefaultsToStrict() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "test",
            List.of(), false, false, null, "", 0.0, List.of(), null);
        assertThat(entry.normalizationMode()).isEqualTo("strict");
    }

    @Test
    void nullRawSolutionTextDefaultsToEmpty() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "test",
            List.of(), false, false, "strict", null, 0.0, List.of(), null);
        assertThat(entry.rawSolutionText()).isEqualTo("");
    }

    @Test
    void typedPayloadPreserved() {
        var payload = new TextExpectedAnswer("der Hund", List.of("der Kater"));
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of("der Kater"), false, false, "strict", "", 1.0, List.of(), payload);
        assertThat(entry.typedPayload()).isInstanceOf(TextExpectedAnswer.class);
        var text = (TextExpectedAnswer) entry.typedPayload();
        assertThat(text.value()).isEqualTo("der Hund");
        assertThat(text.alternatives()).containsExactly("der Kater");
    }

    @Test
    void matchingPayloadPreserved() {
        var payload = new MatchingExpectedAnswer(List.of(
            new MatchingPair("1", "B"),
            new MatchingPair("2", "A")
        ));
        var entry = new AnswerKeyEntry(1, "1", "Matching", 1, "1B — 2A",
            List.of(), false, false, "strict", "", 1.0, List.of(), payload);
        assertThat(entry.typedPayload()).isInstanceOf(MatchingExpectedAnswer.class);
        var matching = (MatchingExpectedAnswer) entry.typedPayload();
        assertThat(matching.pairs()).hasSize(2);
        assertThat(matching.pairs().get(0).leftLabel()).isEqualTo("1");
        assertThat(matching.pairs().get(0).rightLabel()).isEqualTo("B");
    }

    @Test
    void fieldValuesAreAccessible() {
        var entry = new AnswerKeyEntry(42, "12", "FillBlank", 3, "expected",
            List.of("alt"), true, true, "strict", "raw", 0.95, List.of("warn"), null);
        assertThat(entry.pageNumber()).isEqualTo(42);
        assertThat(entry.exerciseNumber()).isEqualTo("12");
        assertThat(entry.ordinal()).isEqualTo(3);
        assertThat(entry.interactionKind()).isEqualTo("FillBlank");
        assertThat(entry.expectedValue()).isEqualTo("expected");
        assertThat(entry.alternatives()).containsExactly("alt");
        assertThat(entry.caseSensitive()).isTrue();
        assertThat(entry.punctuationRequired()).isTrue();
        assertThat(entry.confidence()).isEqualTo(0.95);
        assertThat(entry.mappingWarnings()).containsExactly("warn");
        assertThat(entry.rawSolutionText()).isEqualTo("raw");
    }
}
