package com.lexora.assist.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import tools.jackson.databind.json.JsonMapper;

/**
 * Server-side Cloudflare Turnstile Siteverify validation. The client-side
 * widget/token is never trusted on its own; only a successful Siteverify
 * response marks an anonymous session human-verified.
 */
@Component
public class TurnstileVerifier {

    private static final Logger log = LoggerFactory.getLogger(TurnstileVerifier.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final String secret;
    private final String siteverifyUrl;
    private final HttpClient httpClient;

    public TurnstileVerifier(
        @Value("${lexora.turnstile.secret-key:}") String secret,
        @Value("${lexora.turnstile.siteverify-url:https://challenges.cloudflare.com/turnstile/v0/siteverify}")
        String siteverifyUrl
    ) {
        this.secret = secret == null ? "" : secret;
        this.siteverifyUrl = siteverifyUrl;
        this.httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    }

    public boolean verify(String token) {
        if (token == null || token.isBlank() || secret.isBlank()) {
            return false;
        }
        var form = "secret=" + encode(secret) + "&response=" + encode(token);
        try {
            var request = HttpRequest.newBuilder()
                .uri(URI.create(siteverifyUrl))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                .build();
            var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.info("turnstile siteverify rejected status={}", response.statusCode());
                return false;
            }
            var body = JSON.readValue(response.body(), java.util.Map.class);
            var success = Boolean.TRUE.equals(body.get("success"));
            if (!success) {
                log.info("turnstile siteverify unsuccessful");
            }
            return success;
        } catch (Exception e) {
            log.warn("turnstile siteverify failed", e);
            return false;
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
