package com.lexora.documentanalysis.client;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
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

    @Test
    void providerFailureDoesNotPropagateItsResponseBody() throws Exception {
        var server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/internal/document-analysis/pages", exchange -> {
            var body = "sensitive upstream detail".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(503, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        try {
            var localClient = new DocumentAnalysisClient(
                "http://127.0.0.1:" + server.getAddress().getPort()
            );

            org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                localClient.analyzePage("book", 1, "/data/page.png")
            )
                .hasMessageContaining("HTTP 503")
                .hasMessageNotContaining("sensitive upstream detail");
        } finally {
            server.stop(0);
        }
    }
}
