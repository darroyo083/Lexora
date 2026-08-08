package com.lexora.correction.domain;

import java.util.List;

public final class CorrectionEngine {

    private CorrectionEngine() {}

    public record CorrectionResult(
        CorrectionVerdict verdict,
        AnswerResolutionStatus resolution
    ) {}

    public static CorrectionResult correct(
        AnswerKeyEntry entry,
        String learnerValue,
        AnswerResolutionStatus resolution
    ) {
        if (entry == null) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE,
                resolution != null ? resolution : AnswerResolutionStatus.MISSING);
        }

        if (resolution != AnswerResolutionStatus.RESOLVED) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
        }

        if (isNotAutoGradable(entry.interactionKind())) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
        }

        if (learnerValue == null || learnerValue.isBlank()) {
            return new CorrectionResult(CorrectionVerdict.UNANSWERED, resolution);
        }

        return switch (entry.interactionKind()) {
            case "FillBlank" -> correctFillBlank(entry, learnerValue, resolution);
            case "Matching" -> correctMatching(entry, learnerValue, resolution);
            case "Choice", "ChoiceGrid", "SentenceOrdering" ->
                new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
            default -> new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
        };
    }

    private static CorrectionResult correctFillBlank(
        AnswerKeyEntry entry,
        String learnerValue,
        AnswerResolutionStatus resolution
    ) {
        if (resolution == AnswerResolutionStatus.UNMAPPED
            || resolution == AnswerResolutionStatus.MISSING) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
        }

        var config = NormalizationConfig.forEntry(
            entry.caseSensitive(), entry.punctuationRequired()
        );
        var normalizedLearner = AnswerKeyNormalizer.normalize(learnerValue, config);
        var normalizedExpected = AnswerKeyNormalizer.normalize(entry.expectedValue(), config);

        if (normalizedExpected.isEmpty()) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE,
                AnswerResolutionStatus.MISSING);
        }

        if (normalizedLearner.equals(normalizedExpected)) {
            return new CorrectionResult(CorrectionVerdict.CORRECT, resolution);
        }

        for (var alt : entry.alternatives()) {
            var normalizedAlt = AnswerKeyNormalizer.normalize(alt, config);
            if (normalizedLearner.equals(normalizedAlt)) {
                return new CorrectionResult(CorrectionVerdict.CORRECT, resolution);
            }
        }

        return new CorrectionResult(CorrectionVerdict.INCORRECT, resolution);
    }

    private static CorrectionResult correctMatching(
        AnswerKeyEntry entry,
        String learnerValue,
        AnswerResolutionStatus resolution
    ) {
        if (resolution == AnswerResolutionStatus.UNMAPPED
            || resolution == AnswerResolutionStatus.MISSING) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
        }

        if (!(entry.typedPayload() instanceof MatchingExpectedAnswer matchingPayload)) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
        }

        var expectedPairs = matchingPayload.pairs();
        if (expectedPairs.isEmpty()) {
            return new CorrectionResult(CorrectionVerdict.NOT_AUTO_GRADABLE, resolution);
        }

        var learnerPairs = parseLearnerMatchingPairs(learnerValue);
        if (learnerPairs.isEmpty()) {
            return new CorrectionResult(CorrectionVerdict.UNANSWERED, resolution);
        }

        long correctCount = 0;
        for (var expected : expectedPairs) {
            for (var learner : learnerPairs) {
                if (expected.leftLabel().equals(learner.leftLabel())
                    && expected.rightLabel().equals(learner.rightLabel())) {
                    correctCount++;
                    break;
                }
            }
        }

        int total = expectedPairs.size();
        if (correctCount == total) {
            return new CorrectionResult(CorrectionVerdict.CORRECT, resolution);
        } else if (correctCount > 0) {
            return new CorrectionResult(CorrectionVerdict.PARTIALLY_CORRECT, resolution);
        } else {
            return new CorrectionResult(CorrectionVerdict.INCORRECT, resolution);
        }
    }

    private static List<MatchingPair> parseLearnerMatchingPairs(String learnerValue) {
        if (learnerValue == null || learnerValue.isBlank()) {
            return List.of();
        }
        var parts = learnerValue.split("\\s*[—–\\-]\\s*");
        var pairs = new java.util.ArrayList<MatchingPair>();
        var matcher = java.util.regex.Pattern.compile("(\\d+)([A-F])")
            .matcher("");
        for (var part : parts) {
            matcher.reset(part.trim());
            while (matcher.find()) {
                pairs.add(new MatchingPair(matcher.group(1), matcher.group(2)));
            }
        }
        return List.copyOf(pairs);
    }

    private static boolean isNotAutoGradable(String interactionKind) {
        return "FreeText".equals(interactionKind);
    }
}
