package com.lexora.correction.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class AnswerKeyNormalizerTest {

    @Test
    void normalizeNfc() {
        var result = AnswerKeyNormalizer.normalizeStrict("caf\u00E9");
        assertThat(result).isEqualTo("caf\u00E9");
    }

    @Test
    void normalizeTrims() {
        var result = AnswerKeyNormalizer.normalizeStrict("  hello  ");
        assertThat(result).isEqualTo("hello");
    }

    @Test
    void normalizeCollapsesWhitespace() {
        var result = AnswerKeyNormalizer.normalizeStrict("hello   world");
        assertThat(result).isEqualTo("hello world");
    }

    @Test
    void normalizeGermanQuotes() {
        var result = AnswerKeyNormalizer.normalizeStrict("\u201Edeutsch\u201C");
        assertThat(result).isEqualTo("\"deutsch\"");
    }

    @Test
    void normalizeApostrophes() {
        var result = AnswerKeyNormalizer.normalizeStrict("it\u2019s");
        assertThat(result).isEqualTo("it's");
    }

    @Test
    void normalizeHyphens() {
        var result = AnswerKeyNormalizer.normalizeStrict("Seite\u201315");
        assertThat(result).isEqualTo("Seite-15");
    }

    @Test
    void stripTerminalPunctuation() {
        var s = AnswerKeyNormalizer.stripTerminalPunctuation("hello.");
        assertThat(s).isEqualTo("hello");
    }

    @Test
    void stripTerminalPunctuationMultiple() {
        var s = AnswerKeyNormalizer.stripTerminalPunctuation("hello!?:;");
        assertThat(s).isEqualTo("hello");
    }

    @Test
    void noStripWithoutPunctuation() {
        var s = AnswerKeyNormalizer.stripTerminalPunctuation("hello world");
        assertThat(s).isEqualTo("hello world");
    }

    @Test
    void normalizeWithCaseSensitiveTrue() {
        var config = NormalizationConfig.forEntry(true, false);
        var result = AnswerKeyNormalizer.normalize("Hallo", config);
        assertThat(result).isEqualTo("Hallo");
    }

    @Test
    void normalizeWithCaseSensitiveFalse() {
        var config = NormalizationConfig.forEntry(false, false);
        var result = AnswerKeyNormalizer.normalize("HALLO", config);
        assertThat(result).isEqualTo("hallo");
    }

    @Test
    void normalizeWithPunctuationRequiredTrue() {
        var config = NormalizationConfig.forEntry(true, true);
        var result = AnswerKeyNormalizer.normalize("Hello.", config);
        assertThat(result).isEqualTo("Hello.");
    }

    @Test
    void normalizeWithPunctuationRequiredFalse() {
        var config = NormalizationConfig.forEntry(true, false);
        var result = AnswerKeyNormalizer.normalize("Hello!", config);
        assertThat(result).isEqualTo("Hello");
    }

    @Test
    void ssIsNotNormalizedToSz() {
        var result = AnswerKeyNormalizer.normalizeStrict("Straße");
        assertThat(result).isEqualTo("Straße");
    }

    @Test
    void szIsNotFolded() {
        var result = AnswerKeyNormalizer.normalizeStrict("groß");
        assertThat(result).isNotEqualTo("gross");
    }

    @ParameterizedTest
    @CsvSource({
        "ä, ä",
        "ö, ö",
        "ü, ü",
        "Ä, Ä",
        "Ö, Ö",
        "Ü, Ü",
    })
    void umlautsArePreserved(String input, String expected) {
        var result = AnswerKeyNormalizer.normalizeStrict(input);
        assertThat(result).isEqualTo(expected);
    }

    @Test
    void umlautsAreNotFolded() {
        var result = AnswerKeyNormalizer.normalizeStrict("Hände");
        assertThat(result).isNotEqualTo("Haende");
    }

    @Test
    void emptyStringIsNormalized() {
        var result = AnswerKeyNormalizer.normalizeStrict("");
        assertThat(result).isEqualTo("");
    }

    @Test
    void whitespaceOnlyBecomesEmpty() {
        var result = AnswerKeyNormalizer.normalizeStrict("   ");
        assertThat(result).isEqualTo("");
    }

    @Test
    void normalizeCollapseWhitespaceImplementation() {
        var result = AnswerKeyNormalizer.collapseWhitespace("a  b   c");
        assertThat(result).isEqualTo("a b c");
    }

    @Test
    void normalizeGermanQuotesImplementation() {
        var result = AnswerKeyNormalizer.normalizeGermanQuotes("\u201E\u201C\u201A\u2018");
        assertThat(result).isEqualTo("\"\"''");
    }

    @Test
    void normalizeApostrophesImplementation() {
        var result = AnswerKeyNormalizer.normalizeApostrophes("\u2019´`");
        assertThat(result).isEqualTo("'''");
    }

    @Test
    void normalizeHyphensImplementation() {
        var result = AnswerKeyNormalizer.normalizeHyphens("\u2013\u2014\u2015");
        assertThat(result).isEqualTo("---");
    }
}
