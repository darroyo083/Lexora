package com.lexora.documentanalysis.contract;

import java.util.List;
import java.util.Map;

public record PageAnalysis(
    String schemaVersion,
    int pageNumber,
    int width,
    int height,
    String language,
    List<TextSpan> textSpans,
    List<ExerciseBlank> exerciseBlanks,
    BlankDetectionMetadata blankDetection,
    List<ChoiceGroup> choiceGroups,
    List<ChoiceTarget> choiceTargets,
    ChoiceDetectionMetadata choiceDetection,
    List<ChoiceGrid> choiceGrids,
    ChoiceGridDetectionMetadata choiceGridDetection,
    List<SentenceOrderingInteraction> sentenceOrderings,
    SentenceOrderingDetectionMetadata sentenceOrderingDetection,
    List<MatchingInteraction> matchingInteractions,
    MatchingDetectionMetadata matchingDetection,
    List<FreeTextInteraction> freeTextInteractions,
    FreeTextDetectionMetadata freeTextDetection,
    ProcessorMetadata processor
) {
    public PageAnalysis {
        schemaVersion = schemaVersion == null ? "legacy" : schemaVersion;
        textSpans = textSpans == null ? List.of() : List.copyOf(textSpans);
        exerciseBlanks = exerciseBlanks == null ? List.of() : List.copyOf(exerciseBlanks);
        choiceGroups = choiceGroups == null ? List.of() : List.copyOf(choiceGroups);
        choiceTargets = choiceTargets == null ? List.of() : List.copyOf(choiceTargets);
        choiceGrids = choiceGrids == null ? List.of() : List.copyOf(choiceGrids);
        sentenceOrderings = sentenceOrderings == null ? List.of() : List.copyOf(sentenceOrderings);
        matchingInteractions = matchingInteractions == null
            ? List.of() : List.copyOf(matchingInteractions);
        freeTextInteractions = freeTextInteractions == null
            ? List.of() : List.copyOf(freeTextInteractions);
    }

    public record BBox(double x, double y, double width, double height) {}

    public record TextSpan(
        String id,
        String text,
        double confidence,
        String confidenceScope,
        String parentLineId,
        BBox bbox
    ) {}

    public record ExerciseBlank(
        String id,
        String kind,
        BBox lineBbox,
        BBox interactionBbox,
        String detectionMethod,
        double candidateScore,
        List<String> nearbyTextSpanIds
    ) {
        public ExerciseBlank {
            nearbyTextSpanIds = nearbyTextSpanIds == null
                ? List.of() : List.copyOf(nearbyTextSpanIds);
        }
    }

    public record BlankDetectionMetadata(
        String detectionMethod,
        int rawCandidateCount,
        int acceptedCount,
        long durationMs
    ) {}

    public record ChoiceOption(
        String id,
        String label
    ) {}

    public record ChoiceGroup(
        String id,
        List<ChoiceOption> options
    ) {
        public ChoiceGroup {
            options = options == null ? List.of() : List.copyOf(options);
        }
    }

    public record ChoiceTarget(
        String id,
        String kind,
        BBox targetBbox,
        BBox interactionBbox,
        String optionGroupId,
        String detectionMethod,
        double candidateScore,
        List<String> nearbyTextSpanIds
    ) {
        public ChoiceTarget {
            nearbyTextSpanIds = nearbyTextSpanIds == null
                ? List.of() : List.copyOf(nearbyTextSpanIds);
        }
    }

    public record ChoiceDetectionMetadata(
        String detectionMethod,
        int rawCandidateCount,
        int acceptedCount,
        int groupCount,
        long durationMs
    ) {}

    public record ChoiceGridCell(
        String id,
        String optionId,
        BBox cellBbox,
        BBox interactionBbox
    ) {}

    public record ChoiceGridRow(
        String id,
        BBox rowBbox,
        BBox promptBbox,
        List<String> nearbyTextSpanIds,
        List<ChoiceGridCell> cells
    ) {
        public ChoiceGridRow {
            nearbyTextSpanIds = nearbyTextSpanIds == null
                ? List.of() : List.copyOf(nearbyTextSpanIds);
            cells = cells == null ? List.of() : List.copyOf(cells);
        }
    }

    public record ChoiceGrid(
        String id,
        String kind,
        BBox gridBbox,
        String optionGroupId,
        String detectionMethod,
        double candidateScore,
        List<ChoiceGridRow> rows
    ) {
        public ChoiceGrid {
            rows = rows == null ? List.of() : List.copyOf(rows);
        }
    }

    public record ChoiceGridDetectionMetadata(
        String detectionMethod,
        int rawCandidateCount,
        int acceptedCount,
        int groupCount,
        long durationMs
    ) {}

    public record SentenceOrderingItem(
        String id,
        String text,
        BBox bbox,
        int originalIndex
    ) {}

    public record SentenceOrderingInteraction(
        String id,
        String kind,
        BBox bbox,
        String exerciseId,
        int promptIndex,
        String detectionMethod,
        double candidateScore,
        List<String> nearbyTextSpanIds,
        List<SentenceOrderingItem> items
    ) {
        public SentenceOrderingInteraction {
            nearbyTextSpanIds = nearbyTextSpanIds == null
                ? List.of() : List.copyOf(nearbyTextSpanIds);
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    public record SentenceOrderingDetectionMetadata(
        String detectionMethod,
        int rawCandidateCount,
        int acceptedCount,
        int groupCount,
        long durationMs
    ) {}

    public record MatchingItem(
        String id,
        String label,
        String text,
        BBox bbox,
        BBox anchorBbox,
        List<String> nearbyTextSpanIds
    ) {
        public MatchingItem {
            nearbyTextSpanIds = nearbyTextSpanIds == null
                ? List.of() : List.copyOf(nearbyTextSpanIds);
        }
    }

    public record MatchingInteraction(
        String id,
        String kind,
        BBox bbox,
        String detectionMethod,
        double candidateScore,
        String cardinality,
        List<String> nearbyTextSpanIds,
        List<MatchingItem> leftItems,
        List<MatchingItem> rightItems
    ) {
        public MatchingInteraction {
            nearbyTextSpanIds = nearbyTextSpanIds == null
                ? List.of() : List.copyOf(nearbyTextSpanIds);
            leftItems = leftItems == null ? List.of() : List.copyOf(leftItems);
            rightItems = rightItems == null ? List.of() : List.copyOf(rightItems);
        }
    }

    public record MatchingDetectionMetadata(
        String detectionMethod,
        int rawCandidateCount,
        int acceptedCount,
        int groupCount,
        long durationMs
    ) {}

    public record FreeTextLine(
        String id,
        BBox bbox
    ) {}

    public record FreeTextInteraction(
        String id,
        String kind,
        BBox bbox,
        String detectionMethod,
        double candidateScore,
        List<String> nearbyTextSpanIds,
        List<FreeTextLine> responseLines
    ) {
        public FreeTextInteraction {
            nearbyTextSpanIds = nearbyTextSpanIds == null
                ? List.of() : List.copyOf(nearbyTextSpanIds);
            responseLines = responseLines == null
                ? List.of() : List.copyOf(responseLines);
        }
    }

    public record FreeTextDetectionMetadata(
        String detectionMethod,
        int rawCandidateCount,
        int acceptedCount,
        int groupCount,
        long durationMs
    ) {}

    public record ProcessorMetadata(
        String engine,
        String engineVersion,
        String model,
        String language,
        Map<String, Object> parameters,
        String processedAt,
        long durationMs
    ) {
        public ProcessorMetadata {
            parameters = parameters == null ? Map.of() : Map.copyOf(parameters);
        }
    }
}
