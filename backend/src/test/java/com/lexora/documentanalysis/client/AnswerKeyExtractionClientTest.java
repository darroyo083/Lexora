package com.lexora.documentanalysis.client;

import com.lexora.correction.domain.TextExpectedAnswer;
import com.lexora.documentanalysis.contract.ExtractAnswerKeyResponse;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class AnswerKeyExtractionClientTest {

    private HttpServer server;

    private DocumentAnalysisClient startServer(String responseBody) throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/internal/answer-key/extract", exchange -> {
            var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBody.getBytes(StandardCharsets.UTF_8).length);
            try (var out = exchange.getResponseBody()) {
                out.write(responseBody.getBytes(StandardCharsets.UTF_8));
            }
        });
        server.start();
        return new DocumentAnalysisClient("http://localhost:" + server.getAddress().getPort());
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void extractAnswerKeySendsWellFormedRequest() throws Exception {
        var requestBody = new AtomicReference<String>();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/internal/answer-key/extract", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        server.start();
        var client = new DocumentAnalysisClient("http://localhost:" + server.getAddress().getPort());

        try {
            client.extractAnswerKey("book-1",
                List.of(Path.of("C:\\data\\key-page201-300dpi.png")), "cornelsen");
        } catch (RuntimeException expected) {
            // connection-level failure is fine; the request JSON is what matters
        }

        assertThat(requestBody.get()).isNotNull();
        assertThat(requestBody.get()).contains("\"bookId\":\"book-1\"");
        assertThat(requestBody.get()).contains("\"rasterPaths\"");
        assertThat(requestBody.get()).contains("key-page201-300dpi.png");
        assertThat(requestBody.get()).contains("\"publisher\":\"cornelsen\"");
    }

    @Test
    void extractAnswerKeyDeserializesTypedEntries() throws Exception {
        var responseBody = """
            {
              "bookId": "book-1",
              "extractionMethod": "cornelsen",
              "parserVersion": "1.0.0",
              "sourcePageRange": "201-230",
              "entryCount": 1,
              "entries": [
                {
                  "pageNumber": 201,
                  "exerciseNumber": "12",
                  "interactionKind": "FillBlank",
                  "ordinal": 1,
                  "expectedValue": "der Hund",
                  "alternatives": [],
                  "caseSensitive": false,
                  "punctuationRequired": false,
                  "normalizationMode": "strict",
                  "rawSolutionText": "1 1. der Hund",
                  "confidence": 0.98,
                  "mappingWarnings": ["low_ocr_confidence"],
                  "typedPayload": {"type": "Text", "value": "der Hund", "alternatives": []}
                }
              ]
            }
            """;
        var client = startServer(responseBody);

        var response = client.extractAnswerKey("book-1",
            List.of(Path.of("/data/key-page201-300dpi.png")), "cornelsen");

        assertThat(response.bookId()).isEqualTo("book-1");
        assertThat(response.extractionMethod()).isEqualTo("cornelsen");
        assertThat(response.parserVersion()).isEqualTo("1.0.0");
        assertThat(response.sourcePageRange()).isEqualTo("201-230");
        assertThat(response.entryCount()).isEqualTo(1);
        assertThat(response.entries()).hasSize(1);
        var entry = response.entries().get(0);
        assertThat(entry.expectedValue()).isEqualTo("der Hund");
        assertThat(entry.pageNumber()).isEqualTo(201);
        assertThat(entry.mappingWarnings()).containsExactly("low_ocr_confidence");
        assertThat(entry.typedPayload()).isInstanceOf(TextExpectedAnswer.class);
        assertThat(((TextExpectedAnswer) entry.typedPayload()).value()).isEqualTo("der Hund");
    }

    @Test
    void extractAnswerKeyThrowsOnServerError() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/internal/answer-key/extract", exchange -> {
            var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(422, body.getBytes(StandardCharsets.UTF_8).length);
            try (var out = exchange.getResponseBody()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
        });
        server.start();
        var client = new DocumentAnalysisClient("http://localhost:" + server.getAddress().getPort());

        try {
            client.extractAnswerKey("book-1",
                List.of(Path.of("/data/key-page201-300dpi.png")), "cornelsen");
            assertThat(true).as("expected exception").isFalse();
        } catch (RuntimeException e) {
            assertThat(e.getMessage()).contains("HTTP 422");
        }
    }
}
