package com.lexora.assist.application;

import com.lexora.assist.infrastructure.AssistRepository;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;

/**
 * Privacy-minimized anonymous AI session: an opaque random id persisted in an
 * HttpOnly cookie, with a short-lived human-verification TTL. No account and
 * no personal identity. Raw learner content is never stored here.
 */
@Service
public class AnonymousSessionService {

    public static final String COOKIE_NAME = "lexora_ai_session";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AssistRepository repository;
    private final AssistConfiguration configuration;

    public AnonymousSessionService(AssistRepository repository,
                                   AssistConfiguration configuration) {
        this.repository = repository;
        this.configuration = configuration;
    }

    public String newSessionId() {
        var bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    public void ensureSession(String sessionId) {
        repository.upsertSession(sessionId);
    }

    public boolean isVerified(String sessionId, Instant now) {
        return repository.verifiedUntil(sessionId)
            .map(until -> until.isAfter(now))
            .orElse(false);
    }

    public void markVerified(String sessionId, Instant now) {
        repository.markVerified(
            sessionId,
            now.plus(configuration.humanVerificationTtlMinutes(), ChronoUnit.MINUTES)
        );
    }
}
