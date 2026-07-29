package com.lexora.book.application;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.documentanalysis.client.DocumentAnalysisClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BookServiceTest {

    private BookRepository repository;
    private DocumentAnalysisClient analysisClient;
    private BookService service;

    @BeforeEach
    void setUp() {
        repository = mock(BookRepository.class);
        analysisClient = mock(DocumentAnalysisClient.class);
        service = new BookService(
            repository,
            analysisClient,
            System.getProperty("java.io.tmpdir") + "/lexora-test"
        );
    }

    @Test
    void listBooksReturnsRepositoryResults() {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key");
        when(repository.findAll()).thenReturn(List.of(book));

        var books = service.listBooks();
        assertThat(books).hasSize(1);
        assertThat(books.get(0).title()).isEqualTo("Test");
    }

    @Test
    void getBookNotFoundReturnsEmpty() {
        var id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.empty());

        assertThat(service.getBook(id)).isEmpty();
    }

    @Test
    void getPagesReturnsRepositoryPages() {
        var bookId = UUID.randomUUID();
        var page = new BookPage(
            UUID.randomUUID(), bookId, 1, 800, 600,
            ProcessingStatus.READY, "{}", null, null
        );
        when(repository.findPagesByBookId(bookId)).thenReturn(List.of(page));

        var pages = service.getPages(bookId);
        assertThat(pages).hasSize(1);
    }
}
