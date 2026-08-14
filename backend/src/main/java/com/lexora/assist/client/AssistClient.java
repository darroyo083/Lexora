package com.lexora.assist.client;

import com.lexora.assist.contract.AssistContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Internal client for the ai-service assist endpoint. The backend passes only
 * the reconstructed canonical context; the ai-service owns provider selection
 * and credentials. Provider failures surface as {@link AssistUnavailableException}
 * with no raw provider body.
 */
@Component
public class AssistClient {

    private static final Logger log = LoggerFactory.getLogger(AssistClient.class);
    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    private final String baseUrl;
    private final HttpClient httpClient;

    public AssistClient(@Value("${lexora.ai-service.base-url:http://localhost:8000}") String baseUrl) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    /** Raw validated provider response: content plus an optional check verdict. */
    public record AssistResult(String action, String content, String verdict) {}

    public AssistResult assist(String action, AssistContext context) {
        var payload = JSON.writeValueAsString(new WireRequest(action, context));
        try {
            var request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/internal/assist"))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(60))
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();
            var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                log.info("assist service rejected request status={}", response.statusCode());
                throw new AssistUnavailableException("AI assistance is temporarily unavailable");
            }
            var wire = JSON.readValue(response.body(), WireResponse.class);
            if (wire.content() == null || wire.content().isBlank()) {
                throw new AssistUnavailableException("AI assistance returned no usable result");
            }
            return new AssistResult(wire.action(), wire.content(), wire.verdict());
        } catch (AssistUnavailableException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssistUnavailableException("AI assistance request was interrupted", e);
        } catch (Exception e) {
            throw new AssistUnavailableException("AI assistance is temporarily unavailable", e);
        }
    }

    private record WireRequest(String action, AssistContext context) {}

    private record WireResponse(String action, String content, String verdict) {
        WireResponse {
            // tolerate a missing optional verdict
        }
    }
}
