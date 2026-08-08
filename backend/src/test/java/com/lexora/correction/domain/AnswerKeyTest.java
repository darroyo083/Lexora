package com.lexora.correction.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AnswerKeyTest {

    @Test
    void nullEntriesDefaultToEmptyList() {
        var key = new AnswerKey(UUID.randomUUID(), "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), null, Instant.now(), Instant.now());
        assertThat(key.entries()).isEmpty();
        assertThat(key.entryCount()).isZero();
    }

    @Test
    void entryCountReflectsEntries() {
        var entries = List.of(
            new AnswerKeyEntry(1, "1", "FillBlank", 1, "a", List.of(), false, false, "strict", "", 1.0, List.of(), null),
            new AnswerKeyEntry(1, "1", "FillBlank", 2, "b", List.of(), false, false, "strict", "", 1.0, List.of(), null)
        );
        var key = new AnswerKey(UUID.randomUUID(), "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), entries, Instant.now(), Instant.now());
        assertThat(key.entryCount()).isEqualTo(2);
    }

    @Test
    void failedKeyHasFailureReason() {
        var key = new AnswerKey(UUID.randomUUID(), "cornelsen", "1.0.0", null,
            ExtractionStatus.FAILED, "OCR failed", null, List.of(), Instant.now(), Instant.now());
        assertThat(key.extractionStatus()).isEqualTo(ExtractionStatus.FAILED);
        assertThat(key.failureReason()).isEqualTo("OCR failed");
        assertThat(key.extractedAt()).isNull();
    }
}
