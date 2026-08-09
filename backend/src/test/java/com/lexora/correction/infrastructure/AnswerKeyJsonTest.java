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
}
