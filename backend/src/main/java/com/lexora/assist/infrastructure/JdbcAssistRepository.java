package com.lexora.assist.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

/**
 * JDBC implementation. The global counter and the per-session counter are
 * updated with single atomic SQL statements (INSERT ... ON CONFLICT DO UPDATE
 * ... WHERE / UPDATE ... WHERE), so concurrent requests can never overshoot
 * the cap, and both survive backend restarts.
 */
@Repository
class JdbcAssistRepository implements AssistRepository {

    private final JdbcTemplate jdbc;

    JdbcAssistRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Integer> reserveGlobalProviderCall(LocalDate date, int limit) {
        var rows = jdbc.query(
            """
            INSERT INTO assist_usage (usage_date, provider_calls, updated_at)
            VALUES (?, 1, now())
            ON CONFLICT (usage_date) DO UPDATE SET
                provider_calls = assist_usage.provider_calls + 1,
                updated_at = now()
            WHERE assist_usage.provider_calls < ?
            RETURNING provider_calls
            """,
            (rs, rowNum) -> rs.getInt("provider_calls"),
            date, limit
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public Optional<AssistCacheEntry> findCache(String cacheKey) {
        var rows = jdbc.query(
            "SELECT action, content, verdict, created_at FROM assist_cache WHERE cache_key = ?",
            (rs, rowNum) -> new AssistCacheEntry(
                rs.getString("action"),
                rs.getString("content"),
                rs.getString("verdict"),
                rs.getTimestamp("created_at").toInstant()
            ),
            cacheKey
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public void putCache(String cacheKey, String action, String content, String verdict) {
        jdbc.update(
            """
            INSERT INTO assist_cache (cache_key, action, content, verdict, created_at)
            VALUES (?, ?, ?, ?, now())
            ON CONFLICT (cache_key) DO UPDATE SET
                action = EXCLUDED.action,
                content = EXCLUDED.content,
                verdict = EXCLUDED.verdict,
                created_at = now()
            """,
            cacheKey, action, content, verdict
        );
    }

    @Override
    public void upsertSession(String sessionId) {
        jdbc.update(
            "INSERT INTO assist_sessions (session_id) VALUES (?) ON CONFLICT (session_id) DO NOTHING",
            sessionId
        );
    }

    @Override
    public Optional<Instant> verifiedUntil(String sessionId) {
        var rows = jdbc.query(
            "SELECT verified_until FROM assist_sessions WHERE session_id = ?",
            (rs, rowNum) -> {
                var ts = rs.getTimestamp("verified_until");
                return ts == null ? null : ts.toInstant();
            },
            sessionId
        );
        return rows.isEmpty() ? Optional.empty() : Optional.ofNullable(rows.get(0));
    }

    @Override
    public void markVerified(String sessionId, Instant until) {
        jdbc.update(
            "UPDATE assist_sessions SET verified_until = ?, updated_at = now() WHERE session_id = ?",
            Timestamp.from(until), sessionId
        );
    }

    @Override
    public Optional<Integer> incrementSessionCalls(String sessionId, LocalDate date, int limit) {
        var rows = jdbc.query(
            """
            UPDATE assist_sessions
            SET call_count = CASE WHEN usage_date = ? THEN call_count + 1 ELSE 1 END,
                usage_date = ?,
                updated_at = now()
            WHERE session_id = ?
              AND (usage_date <> ? OR call_count < ?)
            RETURNING call_count
            """,
            (rs, rowNum) -> rs.getInt("call_count"),
            date, date, sessionId, date, limit
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public Optional<Integer> sessionCallCount(String sessionId, LocalDate date) {
        var rows = jdbc.query(
            "SELECT CASE WHEN usage_date = ? THEN call_count ELSE 0 END AS call_count "
                + "FROM assist_sessions WHERE session_id = ?",
            (rs, rowNum) -> rs.getInt("call_count"),
            date, sessionId
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }
}
