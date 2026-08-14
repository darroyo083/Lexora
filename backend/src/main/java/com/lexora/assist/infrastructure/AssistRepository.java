package com.lexora.assist.infrastructure;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

/**
 * Persistence for the three pieces of assist state: the global daily
 * provider-call counter, the response cache, and anonymous sessions.
 * All writes are forward-only and idempotent; none store raw learner content.
 */
public interface AssistRepository {

    /** Atomically reserve one provider call if today's count is under the cap. */
    Optional<Integer> reserveGlobalProviderCall(LocalDate date, int limit);

    Optional<AssistCacheEntry> findCache(String cacheKey);

    void putCache(String cacheKey, String action, String content, String verdict);

    void upsertSession(String sessionId);

    Optional<Instant> verifiedUntil(String sessionId);

    void markVerified(String sessionId, Instant until);

    /** Atomically increment the session's daily count if under the cap. */
    Optional<Integer> incrementSessionCalls(String sessionId, LocalDate date, int limit);

    record AssistCacheEntry(String action, String content, String verdict, Instant createdAt) {}
}
