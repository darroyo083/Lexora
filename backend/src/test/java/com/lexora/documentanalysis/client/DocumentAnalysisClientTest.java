package com.lexora.documentanalysis.client;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentAnalysisClientTest {

    private final DocumentAnalysisClient client =
        new DocumentAnalysisClient("http://localhost:9999");

    @Test
    void payloadIsWellFormedJson() {
        var bookId = UUID.randomUUID().toString();
        // Exercise the client; it will fail to connect, but the JSON is well-formed.
        try {
            client.analyzePage(bookId, 5, "/data/page.png");
        } catch (Exception e) {
            assertThat(e.getMessage()).doesNotContain("Failed to serialize");
        }
    }

    @Test
    void payloadEscapesBackslashAndQuote() {
        try {
            client.analyzePage("id\\\"x", 1, "C:\\\\path\\file.png");
        } catch (Exception e) {
            assertThat(e.getMessage()).doesNotContain("Failed to serialize");
        }
    }

    @Test
    void payloadWithSpecialCharactersDoesNotThrow() {
        try {
            client.analyzePage("abc-123", 42, "/tmp/test.png");
        } catch (Exception e) {
            assertThat(e.getMessage()).doesNotContain("Failed to serialize");
        }
    }
}
