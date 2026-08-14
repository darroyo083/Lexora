package com.lexora.assist.application;

import com.lexora.assist.infrastructure.AssistRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * Server-side response cache keyed by the full canonical request identity
 * (source, page, exercise, action, language, normalized answer hash, provider,
 * and model). Cache hits never consume the provider-call budget. Failures and
 * malformed responses are never cached.
 */
@Service
public class AssistCacheService {

    static final Duration LONG_TTL = Duration.ofDays(7);
    static final Duration CHECK_TTL = Duration.ofHours(1);

    private final AssistRepository repository;

    public AssistCacheService(AssistRepository repository) {
        this.repository = repository;
    }

    public Optional<AssistRepository.AssistCacheEntry> get(String cacheKey, boolean checkAction,
                                                           Instant now) {
        var ttl = checkAction ? CHECK_TTL : LONG_TTL;
        return repository.findCache(cacheKey)
            .filter(entry -> entry.createdAt().plus(ttl).isAfter(now));
    }

    public void put(String cacheKey, String action, String content, String verdict) {
        repository.putCache(cacheKey, action, content, verdict);
    }
}
