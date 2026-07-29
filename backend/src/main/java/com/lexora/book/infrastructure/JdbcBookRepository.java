package com.lexora.book.infrastructure;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcBookRepository implements BookRepository {

    private final JdbcTemplate jdbc;

    JdbcBookRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Book> BOOK_MAPPER = (rs, rowNum) -> new Book(
        rs.getObject("id", UUID.class),
        rs.getString("title"),
        rs.getString("original_filename"),
        rs.getString("mime_type"),
        rs.getLong("file_size"),
        rs.getString("checksum"),
        rs.getInt("page_count"),
        rs.getString("source_language"),
        rs.getString("storage_key"),
        ProcessingStatus.valueOf(rs.getString("status")),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant()
    );

    private static final RowMapper<BookPage> PAGE_MAPPER = (rs, rowNum) -> new BookPage(
        rs.getObject("id", UUID.class),
        rs.getObject("book_id", UUID.class),
        rs.getInt("page_number"),
        rs.getInt("width"),
        rs.getInt("height"),
        ProcessingStatus.valueOf(rs.getString("processing_status")),
        rs.getString("analysis"),
        rs.getTimestamp("processed_at") != null
            ? rs.getTimestamp("processed_at").toInstant() : null,
        rs.getString("failure_reason")
    );

    @Override
    public Book save(Book book) {
        jdbc.update(
            """
            INSERT INTO books (id, title, original_filename, mime_type,
                file_size, checksum, page_count, source_language,
                storage_key, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            book.id(), book.title(), book.originalFilename(), book.mimeType(),
            book.fileSize(), book.checksum(), book.pageCount(), book.sourceLanguage(),
            book.storageKey(), book.status().name(),
            Timestamp.from(book.createdAt()), Timestamp.from(book.updatedAt())
        );
        return book;
    }

    @Override
    public Optional<Book> findById(UUID id) {
        var list = jdbc.query(
            "SELECT * FROM books WHERE id = ?", BOOK_MAPPER, id
        );
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    @Override
    public List<Book> findAll() {
        return jdbc.query("SELECT * FROM books ORDER BY created_at DESC", BOOK_MAPPER);
    }

    @Override
    public BookPage savePage(BookPage page) {
        jdbc.update(
            """
            INSERT INTO book_pages (id, book_id, page_number, width, height,
                processing_status, analysis, processed_at, failure_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (book_id, page_number) DO UPDATE SET
                processing_status = EXCLUDED.processing_status,
                analysis = EXCLUDED.analysis,
                processed_at = EXCLUDED.processed_at,
                failure_reason = EXCLUDED.failure_reason
            """,
            page.id(), page.bookId(), page.pageNumber(),
            page.width(), page.height(),
            page.processingStatus().name(),
            page.analysis(),
            page.processedAt() != null ? Timestamp.from(page.processedAt()) : null,
            page.failureReason()
        );
        return findPage(page.bookId(), page.pageNumber()).orElseThrow();
    }

    @Override
    public Optional<BookPage> findPage(UUID bookId, int pageNumber) {
        var list = jdbc.query(
            "SELECT * FROM book_pages WHERE book_id = ? AND page_number = ?",
            PAGE_MAPPER, bookId, pageNumber
        );
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    @Override
    public List<BookPage> findPagesByBookId(UUID bookId) {
        return jdbc.query(
            "SELECT * FROM book_pages WHERE book_id = ? ORDER BY page_number",
            PAGE_MAPPER, bookId
        );
    }
}
