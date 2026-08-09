package com.lexora.correction.infrastructure;

import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.correction.domain.MatchingExpectedAnswer;
import com.lexora.correction.domain.MatchingPair;
import com.lexora.correction.domain.TextExpectedAnswer;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.core.type.TypeReference;

import static org.assertj.core.api.Assertions.assertThat;

class AnswerKeyJsonTest {

    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    @Test
    void entriesRoundTripThroughRepositoryJsonContract() throws Exception {
        var entries = List.of(
            new AnswerKeyEntry(1, "12", "FillBlank", 1, "der Hund",
                List.of("der Kater"), false, false, "strict", "1 1. der Hund",
                0.98, List.of("low_ocr_confidence"), new TextExpectedAnswer("der Hund")),
            new AnswerKeyEntry(2, "13", "Matching", 1, "1B - 2A",
                List.of(), false, false, "strict", "", 1.0, List.of(),
                new MatchingExpectedAnswer(List.of(
                    new MatchingPair("1", "B"),
                    new MatchingPair("2", "A"))))
        );
        var key = new AnswerKey(UUID.randomUUID(), "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), entries, Instant.now(), Instant.now());

        var json = JSON.writeValueAsString(key.entries());
        List<AnswerKeyEntry> restored = JSON.readValue(json,
            new TypeReference<List<AnswerKeyEntry>>() {});

        assertThat(restored).hasSize(2);
        var text = restored.get(0);
        assertThat(text.expectedValue()).isEqualTo("der Hund");
        assertThat(text.alternatives()).containsExactly("der Kater");
        assertThat(text.mappingWarnings()).containsExactly("low_ocr_confidence");
        assertThat(text.typedPayload()).isInstanceOf(TextExpectedAnswer.class);
        assertThat(((TextExpectedAnswer) text.typedPayload()).value()).isEqualTo("der Hund");

        var matching = restored.get(1);
        assertThat(matching.typedPayload()).isInstanceOf(MatchingExpectedAnswer.class);
        var payload = (MatchingExpectedAnswer) matching.typedPayload();
        assertThat(payload.pairs()).containsExactly(
            new MatchingPair("1", "B"),
            new MatchingPair("2", "A"));
    }

    @Test
    void aiServicePayloadWithTypeDiscriminatorDeserializes() throws Exception {
        var json = """
            [{"pageNumber":1,"exerciseNumber":"12","interactionKind":"FillBlank",
              "ordinal":1,"expectedValue":"der Hund","alternatives":[],
              "caseSensitive":false,"punctuationRequired":false,
              "normalizationMode":"strict","rawSolutionText":"1 1. der Hund",
              "confidence":0.98,"mappingWarnings":[],
              "typedPayload":{"type":"Text","value":"der Hund","alternatives":[]}}]
            """;

        List<AnswerKeyEntry> restored = JSON.readValue(json,
            new TypeReference<List<AnswerKeyEntry>>() {});

        assertThat(restored).hasSize(1);
        assertThat(restored.get(0).expectedValue()).isEqualTo("der Hund");
        assertThat(restored.get(0).typedPayload()).isInstanceOf(TextExpectedAnswer.class);
    }

    @Test
    void serializedTypedPayloadCarriesTypeDiscriminator() throws Exception {
        var entry = new AnswerKeyEntry(1, "12", "FillBlank", 1, "der Hund",
            List.of(), false, false, "strict", "", 1.0, List.of(),
            new TextExpectedAnswer("der Hund"));

        var json = JSON.writeValueAsString(entry);

        assertThat(json).contains("\"type\":\"Text\"");
    }

    @Test
    void unitFieldsRoundTripThroughRepositoryJsonContract() throws Exception {
        var entry = new AnswerKeyEntry(228, "2", "FillBlank", 1, "a,b",
            List.of(), false, false, "strict", "", 1.0, List.of(), null,
            4, "1", List.of("a", "b"));

        var json = JSON.writeValueAsString(List.of(entry));
        List<AnswerKeyEntry> restored = JSON.readValue(json,
            new TypeReference<List<AnswerKeyEntry>>() {});

        assertThat(restored).hasSize(1);
        var text = restored.get(0);
        assertThat(text.unitNumber()).isEqualTo(4);
        assertThat(text.subExerciseMarker()).isEqualTo("1");
        assertThat(text.items()).containsExactly("a", "b");
    }

    @Test
    void legacyEntryWithoutUnitFieldsDeserializesAsNulls() throws Exception {
        var json = """
            [{"pageNumber":1,"exerciseNumber":"12","interactionKind":"FillBlank",
              "ordinal":1,"expectedValue":"der Hund","alternatives":[],
              "caseSensitive":false,"punctuationRequired":false,
              "normalizationMode":"strict","rawSolutionText":"1 1. der Hund",
              "confidence":0.98,"mappingWarnings":[]}]
            """;

        List<AnswerKeyEntry> restored = JSON.readValue(json,
            new TypeReference<List<AnswerKeyEntry>>() {});

        assertThat(restored).hasSize(1);
        assertThat(restored.get(0).unitNumber()).isNull();
        assertThat(restored.get(0).subExerciseMarker()).isNull();
        assertThat(restored.get(0).items()).isEmpty();
    }

    @Test
    void aiServicePayloadWithUnitFieldsDeserializes() throws Exception {
        var json = """
            [{"pageNumber":228,"exerciseNumber":"2","interactionKind":"FillBlank",
              "ordinal":1,"expectedValue":"a,b","alternatives":[],
              "caseSensitive":false,"punctuationRequired":false,
              "normalizationMode":"strict","rawSolutionText":"2 1. a; 2. b",
              "confidence":0.98,"mappingWarnings":[],
              "unitNumber":4,"subExerciseMarker":"1","items":["a","b"],
              "typedPayload":{"type":"Text","value":"a,b","alternatives":[]}}]
            """;

        List<AnswerKeyEntry> restored = JSON.readValue(json,
            new TypeReference<List<AnswerKeyEntry>>() {});

        assertThat(restored).hasSize(1);
        var entry = restored.get(0);
        assertThat(entry.unitNumber()).isEqualTo(4);
        assertThat(entry.subExerciseMarker()).isEqualTo("1");
        assertThat(entry.items()).containsExactly("a", "b");
        assertThat(entry.typedPayload()).isInstanceOf(TextExpectedAnswer.class);
    }
}
