package com.lexora.assist.application;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AssistConfigurationTest {

    private static AssistConfiguration config(boolean enabled, String secret, boolean production) {
        return new AssistConfiguration(
            enabled, "openai", "gpt-4o-mini", 100, 10, 30, 8000,
            "site-key", secret, production
        );
    }

    @Test
    void disabledByDefaultWithoutFlag() {
        assertThat(config(false, "real-secret", true).enabled()).isFalse();
    }

    @Test
    void enabledInDevWithoutSecret() {
        // Local/dev: no Turnstile secret is allowed (verification simply off).
        assertThat(config(true, "", false).enabled()).isTrue();
        assertThat(config(true, "", false).turnstileConfigured()).isFalse();
    }

    @Test
    void devAllowsCloudflareTestSecret() {
        assertThat(config(true, "1x00000000000000000000AA", false).enabled()).isTrue();
    }

    @Test
    void productionRejectsCloudflareTestSecret() {
        assertThat(config(true, "1x00000000000000000000AA", true).enabled()).isFalse();
        assertThat(config(true, "2x00000000000000000000AB", true).enabled()).isFalse();
        assertThat(config(true, "3x00000000000000000000FF", true).enabled()).isFalse();
    }

    @Test
    void productionRejectsMissingSecret() {
        assertThat(config(true, "", true).enabled()).isFalse();
    }

    @Test
    void productionAllowsRealSecret() {
        var cfg = config(true, "a-real-cloudflare-secret", true);
        assertThat(cfg.enabled()).isTrue();
        assertThat(cfg.turnstileConfigured()).isTrue();
    }

    @Test
    void keyPresenceAloneDoesNotEnable() {
        // enabled=false even when a secret exists (kill switch semantics).
        assertThat(config(false, "a-real-cloudflare-secret", true).enabled()).isFalse();
    }
}
