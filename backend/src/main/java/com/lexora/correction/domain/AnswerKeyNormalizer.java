package com.lexora.correction.domain;

import java.text.Normalizer;

public final class AnswerKeyNormalizer {

    private AnswerKeyNormalizer() {}

    public static String normalize(String raw, NormalizationConfig config) {
        String result = raw;
        result = Normalizer.normalize(result, Normalizer.Form.NFC);
        result = result.trim();
        result = collapseWhitespace(result);
        result = normalizeGermanQuotes(result);
        result = normalizeApostrophes(result);
        result = normalizeHyphens(result);
        if (!config.punctuationRequired()) {
            result = stripTerminalPunctuation(result);
        }
        if (!config.caseSensitive()) {
            result = result.toLowerCase();
        }
        return result;
    }

    public static String normalizeStrict(String raw) {
        return normalize(raw, NormalizationConfig.STRICT);
    }

    static String collapseWhitespace(String s) {
        return s.replaceAll("\\s+", " ");
    }

    static String normalizeGermanQuotes(String s) {
        return s.replace('\u201E', '"')
                .replace('\u201C', '"')
                .replace('\u201A', '\'')
                .replace('\u2018', '\'');
    }

    static String normalizeApostrophes(String s) {
        return s.replace('\u2019', '\'')
                .replace('´', '\'')
                .replace('`', '\'');
    }

    static String normalizeHyphens(String s) {
        return s.replace('\u2013', '-')
                .replace('\u2014', '-')
                .replace('\u2015', '-');
    }

    static String stripTerminalPunctuation(String s) {
        return s.replaceAll("[.!?:;,]+$", "").trim();
    }
}
