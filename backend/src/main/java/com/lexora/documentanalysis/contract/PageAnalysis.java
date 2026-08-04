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
    ProcessorMetadata processor
) {
    public PageAnalysis {
        schemaVersion = schemaVersion == null ? "legacy" : schemaVersion;
        textSpans = textSpans == null ? List.of() : List.copyOf(textSpans);
        exerciseBlanks = exerciseBlanks == null ? List.of() : List.copyOf(exerciseBlanks);
        choiceGroups = choiceGroups == null ? List.of() : List.copyOf(choiceGroups);
        choiceTargets = choiceTargets == null ? List.of() : List.copyOf(choiceTargets);
        choiceGrids = choiceGrids == null ? List.of() : List.copyOf(choiceGrids);
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
