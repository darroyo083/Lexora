package com.lexora.assist.application;

import com.lexora.assist.infrastructure.AssistRepository;
import com.lexora.assist.contract.AssistContract.SessionQuota;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

/**
 * Hard, persistent, atomic cost boundaries. The global daily provider-call cap
 * is the final safety net even if a bot evades every other control; it
 * survives restarts (stored in PostgreSQL) and is reserved with a single
 * atomic SQL statement so concurrency cannot overshoot it.
 */
@Service
public class AssistQuotaService {

    public enum Outcome {
        ALLOWED,
        SESSION_LIMIT_REACHED,
        GLOBAL_LIMIT_REACHED
    }

    private final AssistRepository repository;
    private final AssistConfiguration configuration;

    public AssistQuotaService(AssistRepository repository,
                              AssistConfiguration configuration) {
        this.repository = repository;
        this.configuration = configuration;
    }

    public Outcome tryReserve(String sessionId, LocalDate today) {
        if (configuration.globalDailyProviderLimit() < 1) {
            return Outcome.GLOBAL_LIMIT_REACHED;
        }
        var session = repository.incrementSessionCalls(
            sessionId, today, configuration.sessionDailyLimit());
        if (session.isEmpty()) {
            return Outcome.SESSION_LIMIT_REACHED;
        }
        var global = repository.reserveGlobalProviderCall(
            today, configuration.globalDailyProviderLimit());
        if (global.isEmpty()) {
            return Outcome.GLOBAL_LIMIT_REACHED;
        }
        return Outcome.ALLOWED;
    }

    public SessionQuota snapshot(String sessionId, LocalDate today) {
        int limit = Math.max(0, configuration.sessionDailyLimit());
        int used = repository.sessionCallCount(sessionId, today).orElse(0);
        int normalizedUsed = Math.max(0, used);
        return new SessionQuota(normalizedUsed, limit, Math.max(0, limit - normalizedUsed));
    }
}
