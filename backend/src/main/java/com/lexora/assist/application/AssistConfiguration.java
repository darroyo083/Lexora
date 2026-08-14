package com.lexora.assist.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Server-side configuration for Contextual AI Assistance.
 *
 * <p>All values come from {@code LEXORA_ASSIST_*} and {@code LEXORA_TURNSTILE_*}
 * environment variables. No provider key ever reaches the browser. Enablement
 * is an explicit flag — key presence alone never enables the feature (kill
 * switch semantics).
 */
@Component
public class AssistConfiguration {

    private static final Logger log = LoggerFactory.getLogger(AssistConfiguration.class);

    /** Cloudflare's publicly documented Turnstile test secret keys. */
    private static final Set<String> TURNSTILE_TEST_SECRETS = Set.of(
        "1x00000000000000000000AA",
        "2x00000000000000000000AB",
        "3x00000000000000000000FF"
    );

    private final boolean enabled;
    private final String provider;
    private final String model;
    private final int globalDailyProviderLimit;
    private final int sessionDailyLimit;
    private final int humanVerificationTtlMinutes;
    private final int maxContextChars;
    private final String turnstileSiteKey;
    private final String turnstileSecretKey;
    private final boolean production;

    public AssistConfiguration(
        @Value("${lexora.assist.enabled:false}") boolean enabled,
        @Value("${lexora.assist.provider:}") String provider,
        @Value("${lexora.assist.model:}") String model,
        @Value("${lexora.assist.global-daily-provider-limit:100}") int globalDailyProviderLimit,
        @Value("${lexora.assist.session-daily-limit:10}") int sessionDailyLimit,
        @Value("${lexora.assist.human-verification-ttl-minutes:30}") int humanVerificationTtlMinutes,
        @Value("${lexora.assist.max-context-chars:8000}") int maxContextChars,
        @Value("${lexora.turnstile.site-key:}") String turnstileSiteKey,
        @Value("${lexora.turnstile.secret-key:}") String turnstileSecretKey,
        @Value("${lexora.public-demo.enabled:false}") boolean production
    ) {
        this.enabled = effectiveEnabled(enabled, production, turnstileSecretKey);
        this.provider = provider == null ? "" : provider.trim();
        this.model = model == null ? "" : model.trim();
        this.globalDailyProviderLimit = globalDailyProviderLimit;
        this.sessionDailyLimit = sessionDailyLimit;
        this.humanVerificationTtlMinutes = humanVerificationTtlMinutes;
        this.maxContextChars = maxContextChars;
        this.turnstileSiteKey = turnstileSiteKey == null ? "" : turnstileSiteKey.trim();
        this.turnstileSecretKey = turnstileSecretKey == null ? "" : turnstileSecretKey.trim();
        this.production = production;
    }

    private static boolean effectiveEnabled(boolean enabled, boolean production,
                                            String turnstileSecretKey) {
        if (!enabled) {
            return false;
        }
        var secret = turnstileSecretKey == null ? "" : turnstileSecretKey.trim();
        if (production && (secret.isEmpty() || TURNSTILE_TEST_SECRETS.contains(secret))) {
            // Fail closed: public AI assistance must never run behind a test
            // secret (or no secret). Treat the feature as disabled.
            log.error(
                "LEXORA_ASSIST_ENABLED is true in production, but the Turnstile "
                + "secret is missing or a known test secret. AI assistance is "
                + "disabled until a real secret is configured."
            );
            return false;
        }
        return true;
    }

    public boolean enabled() {
        return enabled;
    }

    public String provider() {
        return provider;
    }

    public String model() {
        return model;
    }

    public int globalDailyProviderLimit() {
        return globalDailyProviderLimit;
    }

    public int sessionDailyLimit() {
        return sessionDailyLimit;
    }

    public int humanVerificationTtlMinutes() {
        return humanVerificationTtlMinutes;
    }

    public int maxContextChars() {
        return maxContextChars;
    }

    public String turnstileSiteKey() {
        return turnstileSiteKey;
    }

    public String turnstileSecretKey() {
        return turnstileSecretKey;
    }

    /** Whether Turnstile verification is configured (non-empty secret). */
    public boolean turnstileConfigured() {
        return enabled && !turnstileSecretKey.isEmpty();
    }

    public boolean production() {
        return production;
    }
}
