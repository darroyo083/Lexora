package com.lexora.documentanalysis.contract;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class PageAnalysisTest {

    private final JsonMapper json = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    @Test
    void deserializesVersion02ContractAndIgnoresAdditiveFields() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":2,
              "width":1200,
              "height":1600,
              "language":"de",
              "textSpans":[{
                "id":"span-1","text":"Name","confidence":0.98,
                "confidenceScope":"line","parentLineId":null,
                "bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.04}
              }],
              "exerciseBlanks":[{
                "id":"blank-1","kind":"fill-in-line",
                "lineBbox":{"x":0.4,"y":0.2,"width":0.2,"height":0.01},
                "interactionBbox":{"x":0.4,"y":0.18,"width":0.2,"height":0.05},
                "detectionMethod":"horizontal-line-v1","candidateScore":0.91,
                "nearbyTextSpanIds":["span-1"],
                "futureField":"allowed"
              }],
              "blankDetection":{"detectionMethod":"horizontal-line-v1","rawCandidateCount":2,"acceptedCount":1,"durationMs":4},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12},
              "futureTopLevelField":true
            }
            """, PageAnalysis.class);

        assertThat(analysis.schemaVersion()).isEqualTo("0.2.0");
        assertThat(analysis.textSpans()).hasSize(1);
        assertThat(analysis.exerciseBlanks()).hasSize(1);
        assertThat(analysis.exerciseBlanks().get(0).interactionBbox().x()).isEqualTo(0.4);
        assertThat(analysis.blankDetection().acceptedCount()).isEqualTo(1);
    }

    @Test
    void deserializesVersion02ContractWithChoiceFields() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":2,
              "width":1200,
              "height":1600,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[{
                "id":"choice-group-2-1",
                "options":[
                  {"id":"choice-group-2-1-1","label":"1"},
                  {"id":"choice-group-2-1-2","label":"2"}
                ]
              }],
              "choiceTargets":[{
                "id":"choice-2-1","kind":"choice",
                "targetBbox":{"x":0.3,"y":0.4,"width":0.03,"height":0.03},
                "interactionBbox":{"x":0.28,"y":0.38,"width":0.06,"height":0.06},
                "optionGroupId":"choice-group-2-1",
                "detectionMethod":"empty-ring-v1","candidateScore":0.95,
                "nearbyTextSpanIds":["span-1"]
              }],
              "choiceDetection":{"detectionMethod":"empty-ring-v1","rawCandidateCount":3,"acceptedCount":1,"groupCount":1,"durationMs":5},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.schemaVersion()).isEqualTo("0.2.0");
        assertThat(analysis.choiceGroups()).hasSize(1);
        assertThat(analysis.choiceGroups().get(0).options()).hasSize(2);
        assertThat(analysis.choiceTargets()).hasSize(1);
        assertThat(analysis.choiceTargets().get(0).kind()).isEqualTo("choice");
        assertThat(analysis.choiceTargets().get(0).optionGroupId())
            .isEqualTo("choice-group-2-1");
        assertThat(analysis.choiceDetection().acceptedCount()).isEqualTo(1);
        assertThat(analysis.choiceDetection().groupCount()).isEqualTo(1);
    }

    @Test
    void version02AnalysisWithoutChoiceFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":2,
              "width":1200,
              "height":1600,
              "language":"de",
              "textSpans":[],"exerciseBlanks":[],"blankDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.choiceGroups()).isEmpty();
        assertThat(analysis.choiceTargets()).isEmpty();
        assertThat(analysis.choiceDetection()).isNull();

        var serialized = json.readTree(json.writeValueAsString(analysis));
        assertThat(serialized.get("choiceGroups").isArray()).isTrue();
        assertThat(serialized.get("choiceGroups").isEmpty()).isTrue();
        assertThat(serialized.get("choiceTargets").isEmpty()).isTrue();
        assertThat(serialized.get("choiceDetection").isNull()).isTrue();
    }

    @Test
    void legacyAnalysisDefaultsMissingExerciseBlanksToEmpty() {
        var analysis = json.readValue("""
            {
              "pageNumber":1,"width":800,"height":600,"language":"de",
              "textSpans":[],"blankDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.schemaVersion()).isEqualTo("legacy");
        assertThat(analysis.exerciseBlanks()).isEmpty();
        assertThat(analysis.blankDetection()).isNull();

        var serialized = json.readTree(json.writeValueAsString(analysis));
        assertThat(serialized.get("schemaVersion").asString()).isEqualTo("legacy");
        assertThat(serialized.get("exerciseBlanks").isArray()).isTrue();
        assertThat(serialized.get("exerciseBlanks").isEmpty()).isTrue();
    }
}
