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
    ProcessorMetadata processor
) {
    public PageAnalysis {
        schemaVersion = schemaVersion == null ? "legacy" : schemaVersion;
        textSpans = textSpans == null ? List.of() : List.copyOf(textSpans);
        exerciseBlanks = exerciseBlanks == null ? List.of() : List.copyOf(exerciseBlanks);
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
