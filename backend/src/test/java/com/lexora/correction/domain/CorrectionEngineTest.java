package com.lexora.correction.domain;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CorrectionEngineTest {

    @Test
    void correctFillBlankExactMatch() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "1. der Hund", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Hund", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.CORRECT);
    }

    @Test
    void correctFillBlankMismatch() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "die Katze", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.INCORRECT);
    }

    @Test
    void correctFillBlankAlternativeMatch() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "die Katze",
            List.of("der Kater"), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Kater", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.CORRECT);
    }

    @Test
    void correctFillBlankEmptyLearnerIsUnanswered() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.UNANSWERED);
    }

    @Test
    void correctFillBlankNullLearnerIsUnanswered() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, null, AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.UNANSWERED);
    }

    @Test
    void correctFillBlankWhitespaceOnlyIsUnanswered() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "   ", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.UNANSWERED);
    }

    @Test
    void correctFillBlankCaseInsensitive() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "Der Hund",
            List.of(), false, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der hund", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.CORRECT);
    }

    @Test
    void correctFillBlankWhitespaceNormalized() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der  Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Hund", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.CORRECT);
    }

    @Test
    void correctFillBlankNullEntry() {
        var result = CorrectionEngine.correct(null, "something", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
        assertThat(result.resolution()).isEqualTo(AnswerResolutionStatus.RESOLVED);
    }

    @Test
    void correctFillBlankUnmappedResolution() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Hund", AnswerResolutionStatus.UNMAPPED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
        assertThat(result.resolution()).isEqualTo(AnswerResolutionStatus.UNMAPPED);
    }

    @Test
    void correctFillBlankMissingResolution() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Hund", AnswerResolutionStatus.MISSING);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctFillBlankAmbiguousResolution() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Hund", AnswerResolutionStatus.AMBIGUOUS);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctFillBlankExtractionUncertainResolution() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Hund", AnswerResolutionStatus.EXTRACTION_UNCERTAIN);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctFillBlankEmptyExpectedValueIsNotAutogradable() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "der Hund", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
        assertThat(result.resolution()).isEqualTo(AnswerResolutionStatus.MISSING);
    }

    @Test
    void correctFreeTextIsNotAutoGradable() {
        var entry = new AnswerKeyEntry(1, "1", "FreeText", 1, "model text",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "anything", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctMatchingAllCorrect() {
        var payload = new MatchingExpectedAnswer(List.of(
            new MatchingPair("1", "B"),
            new MatchingPair("2", "A"),
            new MatchingPair("3", "D")
        ));
        var entry = new AnswerKeyEntry(1, "1", "Matching", 1, "1B — 2A — 3D",
            List.of(), true, false, "strict", "", 1.0, List.of(), payload);
        var result = CorrectionEngine.correct(entry, "1B — 2A — 3D", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.CORRECT);
    }

    @Test
    void correctMatchingPartiallyCorrect() {
        var payload = new MatchingExpectedAnswer(List.of(
            new MatchingPair("1", "B"),
            new MatchingPair("2", "A"),
            new MatchingPair("3", "D")
        ));
        var entry = new AnswerKeyEntry(1, "1", "Matching", 1, "1B — 2A — 3D",
            List.of(), true, false, "strict", "", 1.0, List.of(), payload);
        var result = CorrectionEngine.correct(entry, "1B — 2C — 3D", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.PARTIALLY_CORRECT);
    }

    @Test
    void correctMatchingAllIncorrect() {
        var payload = new MatchingExpectedAnswer(List.of(
            new MatchingPair("1", "B"),
            new MatchingPair("2", "A")
        ));
        var entry = new AnswerKeyEntry(1, "1", "Matching", 1, "1B — 2A",
            List.of(), true, false, "strict", "", 1.0, List.of(), payload);
        var result = CorrectionEngine.correct(entry, "1A — 2B", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.INCORRECT);
    }

    @Test
    void correctMatchingEmptyLearnerIsUnanswered() {
        var payload = new MatchingExpectedAnswer(List.of(
            new MatchingPair("1", "B")
        ));
        var entry = new AnswerKeyEntry(1, "1", "Matching", 1, "1B",
            List.of(), true, false, "strict", "", 1.0, List.of(), payload);
        var result = CorrectionEngine.correct(entry, "", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.UNANSWERED);
    }

    @Test
    void correctMatchingWithoutPayloadIsNotAutogradable() {
        var entry = new AnswerKeyEntry(1, "1", "Matching", 1, "1B — 2A",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "1B — 2A", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctMatchingUnmappedResolution() {
        var payload = new MatchingExpectedAnswer(List.of(
            new MatchingPair("1", "B")
        ));
        var entry = new AnswerKeyEntry(1, "1", "Matching", 1, "",
            List.of(), true, false, "strict", "", 1.0, List.of(), payload);
        var result = CorrectionEngine.correct(entry, "1B", AnswerResolutionStatus.UNMAPPED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctChoiceIsNotAutoGradableByStatus() {
        var entry = new AnswerKeyEntry(1, "1", "Choice", 1, "b",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "b", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctChoiceGridIsNotAutoGradableByStatus() {
        var entry = new AnswerKeyEntry(1, "1", "ChoiceGrid", 1, "a,b,c",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "a,b,c", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctSentenceOrderingIsNotAutoGradableByStatus() {
        var entry = new AnswerKeyEntry(1, "1", "SentenceOrdering", 1, "1,2,3",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "1,2,3", AnswerResolutionStatus.RESOLVED);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void correctNullResolutionDefaultsToMissing() {
        var result = CorrectionEngine.correct(null, "test", null);
        assertThat(result.resolution()).isEqualTo(AnswerResolutionStatus.MISSING);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }

    @Test
    void verdictIsNeverIncorrectForUnresolvedEntry() {
        var entry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "der Hund",
            List.of(), true, false, "strict", "", 1.0, List.of(), null);
        var result = CorrectionEngine.correct(entry, "wrong answer", AnswerResolutionStatus.UNMAPPED);
        assertThat(result.verdict()).isNotEqualTo(CorrectionVerdict.INCORRECT);
        assertThat(result.verdict()).isEqualTo(CorrectionVerdict.NOT_AUTO_GRADABLE);
    }
}
