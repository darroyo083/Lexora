package com.lexora.documentanalysis.client;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentAnalysisClientIntegrationTest {

    private HttpServer server;
    private int port;
    private final AtomicReference<String> capturedBody = new AtomicReference<>();
    private final AtomicReference<String> capturedContentType = new AtomicReference<>();
    private final AtomicReference<String> capturedContentLength = new AtomicReference<>();
    private final AtomicReference<String> capturedMethod = new AtomicReference<>();
    private final AtomicReference<String> capturedBlankBody = new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        port = server.getAddress().getPort();

        server.createContext("/internal/document-analysis/pages", exchange -> {
            capturedMethod.set(exchange.getRequestMethod());
            capturedContentType.set(
                exchange.getRequestHeaders().getFirst("Content-Type")
            );
            capturedContentLength.set(
                exchange.getRequestHeaders().getFirst("Content-Length")
            );
            capturedBody.set(
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)
            );

            var response = """
                {"schemaVersion":"0.2.0","pageNumber":1,"width":800,"height":600,"language":"de","textSpans":[],"exerciseBlanks":[],"blankDetection":null,"processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}}
                """;
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length());
            try (var os = exchange.getResponseBody()) {
                os.write(response.getBytes(StandardCharsets.UTF_8));
            }
        });

        server.createContext("/internal/document-analysis/pages/exercise-blanks", exchange -> {
            capturedBlankBody.set(
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)
            );
            var response = """
                {"schemaVersion":"0.2.0","pageNumber":1,"width":800,"height":600,"language":"de","textSpans":[],"exerciseBlanks":[{"id":"blank-1","kind":"fill-in-line","lineBbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.01},"interactionBbox":{"x":0.1,"y":0.18,"width":0.3,"height":0.05},"detectionMethod":"horizontal-line-v1","candidateScore":0.9,"nearbyTextSpanIds":[]}],"blankDetection":{"detectionMethod":"horizontal-line-v1","rawCandidateCount":1,"acceptedCount":1,"durationMs":2},"processor":{"engine":"test","engineVersion":"1","model":"model","language":"de","parameters":{},"processedAt":"2026-07-30T12:00:00Z","durationMs":12}}
                """;
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.getBytes(StandardCharsets.UTF_8).length);
            try (var os = exchange.getResponseBody()) {
                os.write(response.getBytes(StandardCharsets.UTF_8));
            }
        });

        server.setExecutor(null);
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void sendsCorrectMethodContentTypeAndBody() {
        var client = new DocumentAnalysisClient("http://localhost:" + port);
        client.analyzePage("test-book-uuid", 5, "/data/page5.png");

        assertThat(capturedMethod.get()).isEqualTo("POST");
        assertThat(capturedContentType.get()).isEqualTo("application/json");
        assertThat(Integer.parseInt(capturedContentLength.get())).isPositive();

        var json = JsonMapper.builder().build().readTree(capturedBody.get());
        assertThat(json.get("bookId").asString()).isEqualTo("test-book-uuid");
        assertThat(json.get("pageNumber").asInt()).isEqualTo(5);
        assertThat(json.get("imagePath").asString()).isEqualTo("/data/page5.png");
    }

    @Test
    void bodyIsParseableJson() {
        var client = new DocumentAnalysisClient("http://localhost:" + port);
        client.analyzePage("abc", 1, "/x.png");

        assertThat(capturedBody.get()).startsWith("{").endsWith("}");
    }

    @Test
    void contentLengthIsSet() {
        var client = new DocumentAnalysisClient("http://localhost:" + port);
        client.analyzePage("id", 3, "p.png");

        assertThat(capturedBody.get()).isNotEmpty();
        assertThat(Integer.parseInt(capturedContentLength.get()))
            .isEqualTo(capturedBody.get().getBytes(StandardCharsets.UTF_8).length);
    }

    @Test
    void sendsImagePathAndOcrAnalysisForBlankDetection() {
        var client = new DocumentAnalysisClient("http://localhost:" + port);
        var ocr = client.analyzePage("id", 1, "/data/page.png");

        var result = client.detectExerciseBlanks("/data/page.png", ocr);

        var request = JsonMapper.builder().build().readTree(capturedBlankBody.get());
        assertThat(request.get("imagePath").asString()).isEqualTo("/data/page.png");
        assertThat(request.get("analysis").get("schemaVersion").asString()).isEqualTo("0.2.0");
        assertThat(result.exerciseBlanks()).hasSize(1);
        assertThat(result.blankDetection().acceptedCount()).isEqualTo(1);
    }
}
