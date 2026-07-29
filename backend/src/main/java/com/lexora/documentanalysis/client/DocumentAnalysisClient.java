package com.lexora.documentanalysis.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

import tools.jackson.databind.json.JsonMapper;

@Component
public class DocumentAnalysisClient {

    private static final Logger log = LoggerFactory.getLogger(DocumentAnalysisClient.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final String baseUrl;
    private final HttpClient httpClient;

    public DocumentAnalysisClient(
        @Value("${lexora.ai-service.base-url:http://localhost:8000}")
        String baseUrl
    ) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .build();
    }

    public String analyzePage(String bookId, int pageNumber, String imagePath) {
        var payload = JSON.writeValueAsString(
            new AnalyzePageRequest(bookId, pageNumber, imagePath)
        );

        log.info("requesting page analysis bookId={} page={}", bookId, pageNumber);

        try {
            var request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/internal/document-analysis/pages"))
                .version(HttpClient.Version.HTTP_1_1)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();

            var response = httpClient.send(
                request, HttpResponse.BodyHandlers.ofString()
            );

            log.info("page analysis response bookId={} page={} status={}",
                bookId, pageNumber, response.statusCode());

            if (response.statusCode() >= 400) {
                throw new RuntimeException(
                    "Analysis failed: HTTP " + response.statusCode()
                    + " body=" + response.body()
                );
            }

            return response.body();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Analysis request interrupted", e);
        } catch (Exception e) {
            throw new RuntimeException("Analysis request failed", e);
        }
    }

    private record AnalyzePageRequest(
        String bookId,
        int pageNumber,
        String imagePath
    ) {}
}
