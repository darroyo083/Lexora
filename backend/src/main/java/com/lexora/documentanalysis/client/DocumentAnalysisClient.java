package com.lexora.documentanalysis.client;

import com.lexora.documentanalysis.contract.ExtractAnswerKeyResponse;
import com.lexora.documentanalysis.contract.PageAnalysis;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

@Component
public class DocumentAnalysisClient {

    private static final Logger log = LoggerFactory.getLogger(DocumentAnalysisClient.class);
    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    private final String baseUrl;
    private final HttpClient httpClient;

    public DocumentAnalysisClient(
        @Value("${lexora.ai-service.base-url:http://localhost:8000}")
        String baseUrl
    ) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    public PageAnalysis analyzePage(String bookId, int pageNumber, String imagePath) {
        log.info("requesting page analysis bookId={} page={}", bookId, pageNumber);
        return post(
            "/internal/document-analysis/pages",
            new AnalyzePageRequest(bookId, pageNumber, imagePath),
            PageAnalysis.class
        );
    }

    public PageAnalysis detectInteractions(String imagePath, PageAnalysis analysis) {
        log.info("requesting interaction detection page={}", analysis.pageNumber());
        return post(
            "/internal/document-analysis/pages/interactions",
            new DetectInteractionsRequest(imagePath, analysis),
            PageAnalysis.class
        );
    }

    public ExtractAnswerKeyResponse extractAnswerKey(String bookId,
                                                     List<Path> rasterPaths,
                                                     String publisher) {
        log.info("requesting answer key extraction bookId={} pages={}",
            bookId, rasterPaths.size());
        // Answer-key extraction rasterizes and OCRs the whole Loesungen
        // section in one request and can run for well over ten minutes.
        return post(
            "/internal/answer-key/extract",
            new ExtractAnswerKeyRequest(
                bookId,
                rasterPaths.stream().map(Path::toString).toList(),
                publisher
            ),
            ExtractAnswerKeyResponse.class,
            Duration.ofMinutes(45)
        );
    }

    private <T> T post(String path, Object body, Class<T> responseType) {
        return post(path, body, responseType, Duration.ofMinutes(10));
    }

    private <T> T post(String path, Object body, Class<T> responseType,
                       Duration timeout) {
        var payload = JSON.writeValueAsString(body);

        try {
            var request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .version(HttpClient.Version.HTTP_1_1)
                .header("Content-Type", "application/json")
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();

            var response = httpClient.send(
                request, HttpResponse.BodyHandlers.ofString()
            );

            log.info("document analysis response path={} status={}", path, response.statusCode());

            if (response.statusCode() >= 400) {
                throw new RuntimeException(
                    "Analysis failed: HTTP " + response.statusCode()
                    + " body=" + response.body()
                );
            }

            return JSON.readValue(response.body(), responseType);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Analysis request interrupted", e);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Analysis request failed", e);
        }
    }

    private record AnalyzePageRequest(
        String bookId,
        int pageNumber,
        String imagePath
    ) {}

    private record DetectInteractionsRequest(
        String imagePath,
        PageAnalysis analysis
    ) {}

    private record ExtractAnswerKeyRequest(
        String bookId,
        List<String> rasterPaths,
        String publisher
    ) {}
}
