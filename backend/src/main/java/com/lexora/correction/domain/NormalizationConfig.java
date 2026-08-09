package com.lexora.correction.domain;

public record NormalizationConfig(
    boolean caseSensitive,
    boolean punctuationRequired
) {
    public static final NormalizationConfig STRICT = new NormalizationConfig(true, false);

    public static NormalizationConfig forEntry(boolean caseSensitive, boolean punctuationRequired) {
        return new NormalizationConfig(caseSensitive, punctuationRequired);
    }
}
