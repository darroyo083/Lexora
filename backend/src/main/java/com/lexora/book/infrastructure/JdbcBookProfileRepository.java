package com.lexora.book.infrastructure;

import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.PageRange;
import com.lexora.book.domain.UnitRef;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

@Repository
class JdbcBookProfileRepository implements BookProfileRepository {

    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    private final JdbcTemplate jdbc;

    JdbcBookProfileRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<BookProfile> findById(UUID id) {
        return find("SELECT * FROM book_profiles WHERE id = ?", id);
    }

    @Override
    public Optional<BookProfile> findByEditionKey(String editionKey) {
        return find("SELECT * FROM book_profiles WHERE edition_key = ?", editionKey);
    }

    private Optional<BookProfile> find(String sql, Object... args) {
        var list = jdbc.query(sql, (rs, rowNum) -> {
            ProfileMetadata metadata;
            try {
                metadata = JSON.readValue(rs.getString("metadata"), ProfileMetadata.class);
            } catch (Exception e) {
                throw new RuntimeException("Failed to deserialize book profile metadata", e);
            }
            return new BookProfile(
                rs.getObject("id", UUID.class),
                rs.getString("publisher"),
                rs.getString("edition_key"),
                metadata.printedPageOffset(),
                metadata.units(),
                metadata.loesungenPdfRange(),
                metadata.nonUnitPrintedRanges()
            );
        }, args);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    private record ProfileMetadata(
        int printedPageOffset,
        List<UnitRef> units,
        PageRange loesungenPdfRange,
        List<PageRange> nonUnitPrintedRanges
    ) {
        public ProfileMetadata {
            units = units == null ? List.of() : List.copyOf(units);
            nonUnitPrintedRanges = nonUnitPrintedRanges == null
                ? List.of() : List.copyOf(nonUnitPrintedRanges);
        }
    }
}
