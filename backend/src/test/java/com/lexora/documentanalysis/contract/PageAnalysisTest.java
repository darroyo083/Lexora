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
    void deserializesChoiceGridContract() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":29,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[{
                "id":"grid-group-29-1",
                "options":[
                  {"id":"grid-group-29-1-ja","label":"ja"},
                  {"id":"grid-group-29-1-nein","label":"nein"},
                  {"id":"grid-group-29-1-doch","label":"doch"}
                ]
              }],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[{
                "id":"choice-grid-29-1","kind":"choice-grid",
                "gridBbox":{"x":0.154,"y":0.396,"width":0.768,"height":0.189},
                "optionGroupId":"grid-group-29-1",
                "detectionMethod":"table-grid-v1","candidateScore":1.0,
                "rows":[{
                  "id":"choice-grid-29-1-row-1",
                  "rowBbox":{"x":0.154,"y":0.415,"width":0.768,"height":0.023},
                  "promptBbox":{"x":0.187,"y":0.419,"width":0.279,"height":0.013},
                  "nearbyTextSpanIds":["span-29-46"],
                  "cells":[{
                    "id":"choice-grid-29-1-row-1-cell-1",
                    "optionId":"grid-group-29-1-ja",
                    "cellBbox":{"x":0.581,"y":0.415,"width":0.114,"height":0.023},
                    "interactionBbox":{"x":0.581,"y":0.415,"width":0.114,"height":0.023}
                  }]
                }]
              }],
              "choiceGridDetection":{"detectionMethod":"table-grid-v1","rawCandidateCount":22,"acceptedCount":1,"groupCount":1,"durationMs":171},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.choiceGrids()).hasSize(1);
        var grid = analysis.choiceGrids().get(0);
        assertThat(grid.id()).isEqualTo("choice-grid-29-1");
        assertThat(grid.kind()).isEqualTo("choice-grid");
        assertThat(grid.optionGroupId()).isEqualTo("grid-group-29-1");
        assertThat(grid.rows()).hasSize(1);
        assertThat(grid.rows().get(0).cells()).hasSize(1);
        assertThat(grid.rows().get(0).cells().get(0).optionId())
            .isEqualTo("grid-group-29-1-ja");
        assertThat(analysis.choiceGridDetection().acceptedCount()).isEqualTo(1);
        assertThat(analysis.choiceGrids().get(0).rows().get(0).nearbyTextSpanIds())
            .containsExactly("span-29-46");
    }

    @Test
    void version02AnalysisWithoutGridFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":2,
              "width":1200,
              "height":1600,
              "language":"de",
              "textSpans":[],"exerciseBlanks":[],"blankDetection":null,
              "choiceGroups":[],"choiceTargets":[],"choiceDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.choiceGrids()).isEmpty();
        assertThat(analysis.choiceGridDetection()).isNull();
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
