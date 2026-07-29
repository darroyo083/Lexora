package com.lexora.book.application;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.documentanalysis.client.DocumentAnalysisClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class BookServiceTest {

    private BookRepository repository;
    private DocumentAnalysisClient analysisClient;
    private BookService service;

    @TempDir
    Path storagePath;

    @BeforeEach
    void setUp() {
        repository = mock(BookRepository.class);
        analysisClient = mock(DocumentAnalysisClient.class);
        service = new BookService(
            repository,
            analysisClient,
            storagePath.toString()
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

    @Test
    void readyPageReturnsWithoutRunningOcr() throws Exception {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key.pdf");
        var ready = BookPage.create(book.id(), 1, 0, 0).markReady("{}");
        when(repository.findById(book.id())).thenReturn(Optional.of(book));
        when(repository.startPageProcessing(book.id(), 1)).thenReturn(Optional.empty());
        when(repository.findPage(book.id(), 1)).thenReturn(Optional.of(ready));

        var result = service.processPage(book.id(), 1);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.READY);
        verifyNoInteractions(analysisClient);
        verify(repository, never()).savePage(any());
    }

    @Test
    void failedPageCanBeClaimedAndRetried() throws Exception {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key.pdf");
        var pending = BookPage.create(book.id(), 1, 0, 0);
        Files.createDirectories(storagePath.resolve("pdf"));
        Files.createFile(storagePath.resolve("pdf/key-page1-300dpi.png"));
        when(repository.findById(book.id())).thenReturn(Optional.of(book));
        when(repository.startPageProcessing(book.id(), 1)).thenReturn(Optional.of(pending));
        when(repository.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(analysisClient.analyzePage(any(), eq(1), any())).thenReturn("{}");

        var result = service.processPage(book.id(), 1);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.READY);
        verify(repository).startPageProcessing(book.id(), 1);
        verify(analysisClient).analyzePage(eq(book.id().toString()), eq(1), any());
    }

    @Test
    void analysisFailurePersistsFailedStatus() throws Exception {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key.pdf");
        var pending = BookPage.create(book.id(), 1, 0, 0);
        Files.createDirectories(storagePath.resolve("pdf"));
        Files.createFile(storagePath.resolve("pdf/key-page1-300dpi.png"));
        when(repository.findById(book.id())).thenReturn(Optional.of(book));
        when(repository.startPageProcessing(book.id(), 1)).thenReturn(Optional.of(pending));
        when(repository.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(analysisClient.analyzePage(any(), eq(1), any())).thenThrow(new RuntimeException("OCR unavailable"));

        var result = service.processPage(book.id(), 1);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.FAILED);
        assertThat(result.failureReason()).isEqualTo("OCR unavailable");
    }
}
