package com.lexora.assist.application;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Turnstile Siteverify tests against an in-process HTTP stub. Real Cloudflare
 * challenges are never contacted; CI requires no network access.
 */
class TurnstileVerifierTest {

    private HttpServer server;
    private int port;
    private final AtomicReference<String> lastBody = new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        port = server.getAddress().getPort();
        server.setExecutor(null);
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private void respond(String body) {
        server.createContext("/turnstile/v0/siteverify", exchange -> {
            lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.getBytes(StandardCharsets.UTF_8).length);
            try (var os = exchange.getResponseBody()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
        });
    }

    @Test
    void verifiesWithSiteverifyServerAndSecret() {
        respond("{\"success\":true}");

        var verifier = new TurnstileVerifier("the-secret", siteverifyUrl());
        assertThat(verifier.verify("the-token")).isTrue();
        assertThat(lastBody.get()).contains("secret=the-secret");
        assertThat(lastBody.get()).contains("response=the-token");
    }

    @Test
    void blankSecretNeverVerifies() {
        respond("{\"success\":true}");
        var verifier = new TurnstileVerifier("", siteverifyUrl());
        assertThat(verifier.verify("token")).isFalse();
    }

    @Test
    void blankTokenNeverVerifies() {
        respond("{\"success\":true}");
        var verifier = new TurnstileVerifier("secret", siteverifyUrl());
        assertThat(verifier.verify("")).isFalse();
    }

    @Test
    void unsuccessfulSiteverifyRejected() {
        respond("{\"success\":false}");
        var verifier = new TurnstileVerifier("secret", siteverifyUrl());
        assertThat(verifier.verify("token")).isFalse();
    }

    private String siteverifyUrl() {
        return "http://localhost:" + port + "/turnstile/v0/siteverify";
    }
}
