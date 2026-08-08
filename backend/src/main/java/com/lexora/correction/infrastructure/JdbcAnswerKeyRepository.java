package com.lexora.correction.infrastructure;

import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.ExtractionStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.core.type.TypeReference;

@Repository
class JdbcAnswerKeyRepository implements AnswerKeyRepository {

    private static final Logger log = LoggerFactory.getLogger(JdbcAnswerKeyRepository.class);
    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    private final JdbcTemplate jdbc;

    JdbcAnswerKeyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<AnswerKey> findByBookId(UUID bookId) {
        var list = jdbc.query(
            """
            SELECT book_id, extraction_method, parser_version, source_page_range,
                extraction_status, failure_reason, extracted_at, entries,
                created_at, updated_at
            FROM answer_keys WHERE book_id = ?
            """,
            (rs, rowNum) -> {
                var entriesJson = rs.getString("entries");
                List<AnswerKeyEntry> entries;
                try {
                    entries = JSON.readValue(entriesJson,
                        new TypeReference<List<AnswerKeyEntry>>() {});
                } catch (Exception e) {
                    log.error("Failed to deserialize answer key entries for book {}", bookId, e);
                    entries = List.of();
                }
                return new AnswerKey(
                    rs.getObject("book_id", UUID.class),
                    rs.getString("extraction_method"),
                    rs.getString("parser_version"),
                    rs.getString("source_page_range"),
                    ExtractionStatus.valueOf(rs.getString("extraction_status")),
                    rs.getString("failure_reason"),
                    rs.getTimestamp("extracted_at") != null
                        ? rs.getTimestamp("extracted_at").toInstant() : null,
                    entries,
                    rs.getTimestamp("created_at").toInstant(),
                    rs.getTimestamp("updated_at").toInstant()
                );
            },
            bookId
        );
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    @Override
    public void save(AnswerKey key) {
        String entriesJson;
        try {
            entriesJson = JSON.writeValueAsString(key.entries());
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize answer key entries", e);
        }

        jdbc.update(
            """
            INSERT INTO answer_keys (book_id, extraction_method, parser_version,
                source_page_range, extraction_status, failure_reason, extracted_at,
                entries, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
            ON CONFLICT (book_id) DO UPDATE SET
                extraction_method = EXCLUDED.extraction_method,
                parser_version = EXCLUDED.parser_version,
                source_page_range = EXCLUDED.source_page_range,
                extraction_status = EXCLUDED.extraction_status,
                failure_reason = EXCLUDED.failure_reason,
                extracted_at = EXCLUDED.extracted_at,
                entries = EXCLUDED.entries,
                updated_at = EXCLUDED.updated_at
            """,
            key.bookId(),
            key.extractionMethod(),
            key.parserVersion(),
            key.sourcePageRange(),
            key.extractionStatus().name(),
            key.failureReason(),
            key.extractedAt() != null ? Timestamp.from(key.extractedAt()) : null,
            entriesJson,
            Timestamp.from(key.createdAt()),
            Timestamp.from(key.updatedAt())
        );
    }

    @Override
    public boolean existsByBookId(UUID bookId) {
        var count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM answer_keys WHERE book_id = ?",
            Integer.class, bookId
        );
        return count != null && count > 0;
    }
}
