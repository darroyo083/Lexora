package com.lexora.assist.client;

import com.lexora.assist.contract.AssistContext;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AssistClientTest {

    private HttpServer server;
    private int port;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        port = server.getAddress().getPort();

        server.createContext("/internal/assist", exchange -> {
            var response = "{\"action\":\"check\",\"content\":\"Looks fine\",\"verdict\":\"likely_correct\"}";
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
    void returnsParsedResult() {
        var client = new AssistClient("http://localhost:" + port);
        var result = client.assist("check", context());
        assertThat(result.content()).isEqualTo("Looks fine");
        assertThat(result.verdict()).isEqualTo("likely_correct");
    }

    @Test
    void non2xxFailsClosedWithoutBody() throws IOException {
        var failing = HttpServer.create(new InetSocketAddress(0), 0);
        int failingPort = failing.getAddress().getPort();
        failing.createContext("/internal/assist", exchange -> {
            exchange.sendResponseHeaders(503, 0);
            exchange.close();
        });
        failing.setExecutor(null);
        failing.start();
        try {
            var client = new AssistClient("http://localhost:" + failingPort);
            assertThatThrownBy(() -> client.assist("hint", context()))
                .isInstanceOf(AssistUnavailableException.class)
                .hasMessageNotContaining("secret")
                .hasMessageNotContaining("provider body");
        } finally {
            failing.stop(0);
        }
    }

    private static AssistContext context() {
        return new AssistContext("t", "i", "s", "fill-in-line", List.of(),
            "answer", "de", null);
    }
}
