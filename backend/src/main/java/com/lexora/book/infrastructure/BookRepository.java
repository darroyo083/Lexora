package com.lexora.book.infrastructure;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BookRepository {
    Book save(Book book);
    Book upsert(Book book);
    Optional<Book> findById(UUID id);
    List<Book> findAll();
    void attachBookProfile(UUID bookId, UUID profileId);

    BookPage savePage(BookPage page);
    Optional<BookPage> startPageProcessing(UUID bookId, int pageNumber, boolean refreshAnalysis);
    Optional<BookPage> findPage(UUID bookId, int pageNumber);
    List<BookPage> findPagesByBookId(UUID bookId);
}
