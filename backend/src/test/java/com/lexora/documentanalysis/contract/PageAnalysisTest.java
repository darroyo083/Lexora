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

    @Test
    void deserializesSentenceOrderingContract() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":33,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[],
              "choiceGridDetection":null,
              "sentenceOrderings":[{
                "id":"sentence-ordering-33-1-1","kind":"sentence-ordering",
                "bbox":{"x":0.151,"y":0.078,"width":0.476,"height":0.015},
                "exerciseId":"sentence-order-exercise-33-1","promptIndex":1,
                "detectionMethod":"sentence-ordering-v1","candidateScore":0.95,
                "nearbyTextSpanIds":["span-33-1"],
                "items":[
                  {"id":"sentence-ordering-33-1-1-item-1","text":"Am letzten Wochenende","bbox":{"x":0.151,"y":0.078,"width":0.208,"height":0.015},"originalIndex":1},
                  {"id":"sentence-ordering-33-1-1-item-2","text":"nach Berlin","bbox":{"x":0.359,"y":0.078,"width":0.093,"height":0.015},"originalIndex":2},
                  {"id":"sentence-ordering-33-1-1-item-3","text":"Anna","bbox":{"x":0.452,"y":0.078,"width":0.053,"height":0.015},"originalIndex":3},
                  {"id":"sentence-ordering-33-1-1-item-4","text":"ist","bbox":{"x":0.505,"y":0.078,"width":0.030,"height":0.015},"originalIndex":4},
                  {"id":"sentence-ordering-33-1-1-item-5","text":"gefahren","bbox":{"x":0.535,"y":0.078,"width":0.077,"height":0.015},"originalIndex":5},
                  {"id":"sentence-ordering-33-1-1-item-6","text":".","bbox":{"x":0.612,"y":0.078,"width":0.015,"height":0.015},"originalIndex":6}
                ]
              }],
              "sentenceOrderingDetection":{"detectionMethod":"sentence-ordering-v1","rawCandidateCount":22,"acceptedCount":22,"groupCount":4,"durationMs":110},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.sentenceOrderings()).hasSize(1);
        var interaction = analysis.sentenceOrderings().get(0);
        assertThat(interaction.id()).isEqualTo("sentence-ordering-33-1-1");
        assertThat(interaction.kind()).isEqualTo("sentence-ordering");
        assertThat(interaction.exerciseId()).isEqualTo("sentence-order-exercise-33-1");
        assertThat(interaction.promptIndex()).isEqualTo(1);
        assertThat(interaction.detectionMethod()).isEqualTo("sentence-ordering-v1");
        assertThat(interaction.nearbyTextSpanIds()).containsExactly("span-33-1");
        assertThat(interaction.items()).hasSize(6);
        assertThat(interaction.items().get(0).id())
            .isEqualTo("sentence-ordering-33-1-1-item-1");
        assertThat(interaction.items().get(0).text()).isEqualTo("Am letzten Wochenende");
        assertThat(interaction.items().get(0).originalIndex()).isEqualTo(1);
        assertThat(analysis.sentenceOrderingDetection().acceptedCount()).isEqualTo(22);
        assertThat(analysis.sentenceOrderingDetection().groupCount()).isEqualTo(4);
    }

    @Test
    void version02AnalysisWithoutSentenceOrderingFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":2,
              "width":1200,
              "height":1600,
              "language":"de",
              "textSpans":[],"exerciseBlanks":[],"blankDetection":null,
              "choiceGroups":[],"choiceTargets":[],"choiceDetection":null,
              "choiceGrids":[],"choiceGridDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.sentenceOrderings()).isEmpty();
        assertThat(analysis.sentenceOrderingDetection()).isNull();

        var serialized = json.readTree(json.writeValueAsString(analysis));
        assertThat(serialized.get("sentenceOrderings").isArray()).isTrue();
        assertThat(serialized.get("sentenceOrderings").isEmpty()).isTrue();
        assertThat(serialized.get("sentenceOrderingDetection").isNull()).isTrue();
    }

    @Test
    void legacyAnalysisWithoutSentenceOrderingFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "pageNumber":1,"width":800,"height":600,"language":"de",
              "textSpans":[],"blankDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.sentenceOrderings()).isEmpty();
        assertThat(analysis.sentenceOrderingDetection()).isNull();
    }

    @Test
    void deserializesMatchingContract() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":49,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[],
              "choiceGridDetection":null,
              "sentenceOrderings":[],
              "sentenceOrderingDetection":null,
              "matchingInteractions":[{
                "id":"matching-49-1","kind":"matching",
                "bbox":{"x":0.175,"y":0.406,"width":0.715,"height":0.135},
                "detectionMethod":"matching-v1","candidateScore":0.9875,
                "cardinality":"one-to-one",
                "nearbyTextSpanIds":["span-49-26","span-49-28"],
                "leftItems":[{
                  "id":"matching-49-1-left-1","label":"1",
                  "text":"Synthetic left item text",
                  "bbox":{"x":0.195,"y":0.406,"width":0.305,"height":0.014},
                  "anchorBbox":{"x":0.545,"y":0.415,"width":0.003,"height":0.003},
                  "nearbyTextSpanIds":["span-49-26"]
                }],
                "rightItems":[{
                  "id":"matching-49-1-right-1","label":"A",
                  "text":"Synthetic right item text",
                  "bbox":{"x":0.593,"y":0.407,"width":0.219,"height":0.014},
                  "anchorBbox":null,
                  "nearbyTextSpanIds":["span-49-28"]
                }]
              }],
              "matchingDetection":{"detectionMethod":"matching-v1","rawCandidateCount":1,"acceptedCount":1,"groupCount":1,"durationMs":88},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.matchingInteractions()).hasSize(1);
        var interaction = analysis.matchingInteractions().get(0);
        assertThat(interaction.id()).isEqualTo("matching-49-1");
        assertThat(interaction.kind()).isEqualTo("matching");
        assertThat(interaction.detectionMethod()).isEqualTo("matching-v1");
        assertThat(interaction.cardinality()).isEqualTo("one-to-one");
        assertThat(interaction.bbox().y()).isEqualTo(0.406);
        assertThat(interaction.nearbyTextSpanIds()).containsExactly("span-49-26", "span-49-28");
        assertThat(interaction.leftItems()).hasSize(1);
        assertThat(interaction.leftItems().get(0).id()).isEqualTo("matching-49-1-left-1");
        assertThat(interaction.leftItems().get(0).label()).isEqualTo("1");
        assertThat(interaction.leftItems().get(0).anchorBbox().x()).isEqualTo(0.545);
        assertThat(interaction.rightItems()).hasSize(1);
        assertThat(interaction.rightItems().get(0).label()).isEqualTo("A");
        assertThat(interaction.rightItems().get(0).anchorBbox()).isNull();
        assertThat(analysis.matchingDetection().acceptedCount()).isEqualTo(1);
        assertThat(analysis.matchingDetection().groupCount()).isEqualTo(1);
    }

    @Test
    void matchingContractRoundTripsThroughSerialization() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":49,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[],
              "choiceGridDetection":null,
              "sentenceOrderings":[],
              "sentenceOrderingDetection":null,
              "matchingInteractions":[{
                "id":"matching-49-1","kind":"matching",
                "bbox":{"x":0.175,"y":0.406,"width":0.715,"height":0.135},
                "detectionMethod":"matching-v1","candidateScore":0.9875,
                "cardinality":"one-to-one",
                "nearbyTextSpanIds":[],
                "leftItems":[{
                  "id":"matching-49-1-left-1","label":"1",
                  "text":"Synthetic left item text",
                  "bbox":{"x":0.195,"y":0.406,"width":0.305,"height":0.014},
                  "anchorBbox":{"x":0.545,"y":0.415,"width":0.003,"height":0.003},
                  "nearbyTextSpanIds":["span-49-26"]
                }],
                "rightItems":[{
                  "id":"matching-49-1-right-1","label":"A",
                  "text":"Synthetic right item text",
                  "bbox":{"x":0.593,"y":0.407,"width":0.219,"height":0.014},
                  "anchorBbox":null,
                  "nearbyTextSpanIds":["span-49-28"]
                }]
              }],
              "matchingDetection":{"detectionMethod":"matching-v1","rawCandidateCount":1,"acceptedCount":1,"groupCount":1,"durationMs":88},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        var serialized = json.writeValueAsString(analysis);
        var restored = json.readValue(serialized, PageAnalysis.class);

        assertThat(restored.matchingInteractions()).hasSize(1);
        assertThat(restored.matchingInteractions().get(0).id())
            .isEqualTo(analysis.matchingInteractions().get(0).id());
        assertThat(restored.matchingInteractions().get(0).leftItems().get(0).text())
            .isEqualTo("Synthetic left item text");
        assertThat(restored.matchingInteractions().get(0).leftItems().get(0).anchorBbox())
            .isEqualTo(analysis.matchingInteractions().get(0).leftItems().get(0).anchorBbox());
        assertThat(restored.matchingDetection().durationMs())
            .isEqualTo(analysis.matchingDetection().durationMs());
        assertThat(restored.sentenceOrderings()).isEmpty();
        assertThat(restored.choiceGrids()).isEmpty();
    }

    @Test
    void version02AnalysisWithoutMatchingFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":2,
              "width":1200,
              "height":1600,
              "language":"de",
              "textSpans":[],"exerciseBlanks":[],"blankDetection":null,
              "choiceGroups":[],"choiceTargets":[],"choiceDetection":null,
              "choiceGrids":[],"choiceGridDetection":null,
              "sentenceOrderings":[],"sentenceOrderingDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.matchingInteractions()).isEmpty();
        assertThat(analysis.matchingDetection()).isNull();

        var serialized = json.readTree(json.writeValueAsString(analysis));
        assertThat(serialized.get("matchingInteractions").isArray()).isTrue();
        assertThat(serialized.get("matchingInteractions").isEmpty()).isTrue();
        assertThat(serialized.get("matchingDetection").isNull()).isTrue();
    }

    @Test
    void legacyAnalysisWithoutMatchingFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "pageNumber":1,"width":800,"height":600,"language":"de",
              "textSpans":[],"blankDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.matchingInteractions()).isEmpty();
        assertThat(analysis.matchingDetection()).isNull();
    }

    @Test
    void deserializesFreeTextContract() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":28,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[],
              "choiceGridDetection":null,
              "sentenceOrderings":[],
              "sentenceOrderingDetection":null,
              "matchingInteractions":[],
              "matchingDetection":null,
              "freeTextInteractions":[{
                "id":"free-text-28-1","kind":"free-text",
                "bbox":{"x":0.451,"y":0.572,"width":0.468,"height":0.216},
                "detectionMethod":"free-text-v1","candidateScore":0.9333,
                "nearbyTextSpanIds":["span-28-1"],
                "responseLines":[
                  {"id":"free-text-28-1-line-1","bbox":{"x":0.451,"y":0.572,"width":0.468,"height":0.0013}},
                  {"id":"free-text-28-1-line-2","bbox":{"x":0.451,"y":0.596,"width":0.468,"height":0.0013}}
                ]
              }],
              "freeTextDetection":{"detectionMethod":"free-text-v1","rawCandidateCount":11,"acceptedCount":1,"groupCount":1,"durationMs":88},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.freeTextInteractions()).hasSize(1);
        var interaction = analysis.freeTextInteractions().get(0);
        assertThat(interaction.id()).isEqualTo("free-text-28-1");
        assertThat(interaction.kind()).isEqualTo("free-text");
        assertThat(interaction.detectionMethod()).isEqualTo("free-text-v1");
        assertThat(interaction.bbox().y()).isEqualTo(0.572);
        assertThat(interaction.nearbyTextSpanIds()).containsExactly("span-28-1");
        assertThat(interaction.responseLines()).hasSize(2);
        assertThat(interaction.responseLines().get(0).id())
            .isEqualTo("free-text-28-1-line-1");
        assertThat(interaction.responseLines().get(1).bbox().y()).isEqualTo(0.596);
        assertThat(analysis.freeTextDetection().acceptedCount()).isEqualTo(1);
        assertThat(analysis.freeTextDetection().groupCount()).isEqualTo(1);
    }

    @Test
    void freeTextContractRoundTripsThroughSerialization() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":28,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[],
              "choiceGridDetection":null,
              "sentenceOrderings":[],
              "sentenceOrderingDetection":null,
              "matchingInteractions":[],
              "matchingDetection":null,
              "freeTextInteractions":[{
                "id":"free-text-28-1","kind":"free-text",
                "bbox":{"x":0.451,"y":0.572,"width":0.468,"height":0.216},
                "detectionMethod":"free-text-v1","candidateScore":0.9333,
                "nearbyTextSpanIds":[],
                "responseLines":[{
                  "id":"free-text-28-1-line-1",
                  "bbox":{"x":0.451,"y":0.572,"width":0.468,"height":0.0013}
                }]
              }],
              "freeTextDetection":{"detectionMethod":"free-text-v1","rawCandidateCount":1,"acceptedCount":1,"groupCount":1,"durationMs":88},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        var serialized = json.writeValueAsString(analysis);
        var restored = json.readValue(serialized, PageAnalysis.class);

        assertThat(restored.freeTextInteractions()).hasSize(1);
        assertThat(restored.freeTextInteractions().get(0).id())
            .isEqualTo(analysis.freeTextInteractions().get(0).id());
        assertThat(restored.freeTextInteractions().get(0).responseLines().get(0).bbox())
            .isEqualTo(analysis.freeTextInteractions().get(0).responseLines().get(0).bbox());
        assertThat(restored.freeTextDetection().durationMs())
            .isEqualTo(analysis.freeTextDetection().durationMs());
        assertThat(restored.matchingInteractions()).isEmpty();
        assertThat(restored.sentenceOrderings()).isEmpty();
    }

    @Test
    void deserializesMultipleFreeTextInteractions() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":149,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[],
              "blankDetection":null,
              "choiceGroups":[],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[],
              "choiceGridDetection":null,
              "sentenceOrderings":[],
              "sentenceOrderingDetection":null,
              "matchingInteractions":[],
              "matchingDetection":null,
              "freeTextInteractions":[
                {"id":"free-text-149-1","kind":"free-text",
                 "bbox":{"x":0.181,"y":0.348,"width":0.74,"height":0.12},
                 "detectionMethod":"free-text-v1","candidateScore":0.91,
                 "nearbyTextSpanIds":[],"responseLines":[]},
                {"id":"free-text-149-2","kind":"free-text",
                 "bbox":{"x":0.181,"y":0.55,"width":0.74,"height":0.1},
                 "detectionMethod":"free-text-v1","candidateScore":0.85,
                 "nearbyTextSpanIds":[],"responseLines":[]}
              ],
              "freeTextDetection":{"detectionMethod":"free-text-v1","rawCandidateCount":2,"acceptedCount":2,"groupCount":2,"durationMs":77},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.freeTextInteractions()).hasSize(2);
        assertThat(analysis.freeTextInteractions().get(0).id()).isEqualTo("free-text-149-1");
        assertThat(analysis.freeTextInteractions().get(1).id()).isEqualTo("free-text-149-2");
        assertThat(analysis.freeTextDetection().acceptedCount()).isEqualTo(2);
    }

    @Test
    void version02AnalysisWithoutFreeTextFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":2,
              "width":1200,
              "height":1600,
              "language":"de",
              "textSpans":[],"exerciseBlanks":[],"blankDetection":null,
              "choiceGroups":[],"choiceTargets":[],"choiceDetection":null,
              "choiceGrids":[],"choiceGridDetection":null,
              "sentenceOrderings":[],"sentenceOrderingDetection":null,
              "matchingInteractions":[],"matchingDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.freeTextInteractions()).isEmpty();
        assertThat(analysis.freeTextDetection()).isNull();

        var serialized = json.readTree(json.writeValueAsString(analysis));
        assertThat(serialized.get("freeTextInteractions").isArray()).isTrue();
        assertThat(serialized.get("freeTextInteractions").isEmpty()).isTrue();
        assertThat(serialized.get("freeTextDetection").isNull()).isTrue();
    }

    @Test
    void legacyAnalysisWithoutFreeTextFieldsDefaultsToEmpty() {
        var analysis = json.readValue("""
            {
              "pageNumber":1,"width":800,"height":600,"language":"de",
              "textSpans":[],"blankDetection":null,
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        assertThat(analysis.freeTextInteractions()).isEmpty();
        assertThat(analysis.freeTextDetection()).isNull();
    }

    @Test
    void coexistingFreeTextAndOtherInteractionsRoundTrip() {
        var analysis = json.readValue("""
            {
              "schemaVersion":"0.2.0",
              "pageNumber":49,
              "width":2284,
              "height":3121,
              "language":"de",
              "textSpans":[],
              "exerciseBlanks":[{
                "id":"blank-49-1","kind":"fill-in-line",
                "lineBbox":{"x":0.4,"y":0.2,"width":0.2,"height":0.01},
                "interactionBbox":{"x":0.4,"y":0.18,"width":0.2,"height":0.05},
                "detectionMethod":"horizontal-line-v1","candidateScore":0.91,
                "nearbyTextSpanIds":[]
              }],
              "blankDetection":{"detectionMethod":"horizontal-line-v1","rawCandidateCount":2,"acceptedCount":1,"durationMs":4},
              "choiceGroups":[],
              "choiceTargets":[],
              "choiceDetection":null,
              "choiceGrids":[],
              "choiceGridDetection":null,
              "sentenceOrderings":[],
              "sentenceOrderingDetection":null,
              "matchingInteractions":[{
                "id":"matching-49-1","kind":"matching",
                "bbox":{"x":0.175,"y":0.406,"width":0.715,"height":0.135},
                "detectionMethod":"matching-v1","candidateScore":0.9875,
                "cardinality":"one-to-one",
                "nearbyTextSpanIds":[],"leftItems":[],"rightItems":[]
              }],
              "matchingDetection":{"detectionMethod":"matching-v1","rawCandidateCount":1,"acceptedCount":1,"groupCount":1,"durationMs":88},
              "freeTextInteractions":[{
                "id":"free-text-49-1","kind":"free-text",
                "bbox":{"x":0.451,"y":0.572,"width":0.468,"height":0.216},
                "detectionMethod":"free-text-v1","candidateScore":0.93,
                "nearbyTextSpanIds":[],"responseLines":[]
              }],
              "freeTextDetection":{"detectionMethod":"free-text-v1","rawCandidateCount":1,"acceptedCount":1,"groupCount":1,"durationMs":88},
              "processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}
            }
            """, PageAnalysis.class);

        var serialized = json.writeValueAsString(analysis);
        var restored = json.readValue(serialized, PageAnalysis.class);

        assertThat(restored.exerciseBlanks()).hasSize(1);
        assertThat(restored.matchingInteractions()).hasSize(1);
        assertThat(restored.freeTextInteractions()).hasSize(1);
        assertThat(restored.freeTextInteractions().get(0).id()).isEqualTo("free-text-49-1");
        assertThat(restored.matchingInteractions().get(0).id()).isEqualTo("matching-49-1");
    }
}
