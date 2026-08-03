package com.lexora.book.application;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.documentanalysis.client.DocumentAnalysisClient;
import com.lexora.documentanalysis.contract.PageAnalysis;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.Map;

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
        when(repository.startPageProcessing(book.id(), 1, false)).thenReturn(Optional.empty());
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
        when(repository.startPageProcessing(book.id(), 1, false)).thenReturn(Optional.of(pending));
        when(repository.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var ocr = analysis(List.of());
        var completed = analysis(List.of(
            new PageAnalysis.ExerciseBlank(
                "blank-1", "fill-in-line",
                new PageAnalysis.BBox(0.1, 0.2, 0.3, 0.01),
                new PageAnalysis.BBox(0.1, 0.18, 0.3, 0.05),
                "horizontal-line-v1", 0.9, List.of()
            )
        ));
        when(analysisClient.analyzePage(any(), eq(1), any())).thenReturn(ocr);
        when(analysisClient.detectInteractions(any(), eq(ocr))).thenReturn(completed);

        var result = service.processPage(book.id(), 1);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.READY);
        verify(repository).startPageProcessing(book.id(), 1, false);
        verify(analysisClient).analyzePage(eq(book.id().toString()), eq(1), any());
        verify(analysisClient).detectInteractions(any(), eq(ocr));
        assertThat(result.analysis()).contains("\"schemaVersion\":\"0.2.0\"");
        assertThat(result.analysis()).contains("\"exerciseBlanks\":[{");

        var statuses = org.mockito.ArgumentCaptor.forClass(BookPage.class);
        verify(repository, times(5)).savePage(statuses.capture());
        assertThat(statuses.getAllValues())
            .extracting(BookPage::processingStatus)
            .containsExactly(
                ProcessingStatus.RASTERIZING,
                ProcessingStatus.OCR,
                ProcessingStatus.DETECTING_INTERACTIONS,
                ProcessingStatus.PERSISTING,
                ProcessingStatus.READY
            );
    }

    @Test
    void forcedRefreshCanClaimAndReplaceReadyAnalysis() throws Exception {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key.pdf");
        var pending = BookPage.create(book.id(), 1, 0, 0);
        Files.createDirectories(storagePath.resolve("pdf"));
        Files.createFile(storagePath.resolve("pdf/key-page1-300dpi.png"));
        when(repository.findById(book.id())).thenReturn(Optional.of(book));
        when(repository.startPageProcessing(book.id(), 1, true)).thenReturn(Optional.of(pending));
        when(repository.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var analysis = analysis(List.of());
        when(analysisClient.analyzePage(any(), eq(1), any())).thenReturn(analysis);
        when(analysisClient.detectInteractions(any(), eq(analysis))).thenReturn(analysis);

        var result = service.processPage(book.id(), 1, true);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.READY);
        verify(repository).startPageProcessing(book.id(), 1, true);
        verify(analysisClient).analyzePage(eq(book.id().toString()), eq(1), any());
    }

    @Test
    void forcedRefreshFailureRetainsPreviousAnalysis() throws Exception {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key.pdf");
        var previousAnalysis = "{\"schemaVersion\":\"legacy\"}";
        var pending = new BookPage(
            UUID.randomUUID(), book.id(), 1, 0, 0,
            ProcessingStatus.PENDING, previousAnalysis, null, null
        );
        Files.createDirectories(storagePath.resolve("pdf"));
        Files.createFile(storagePath.resolve("pdf/key-page1-300dpi.png"));
        when(repository.findById(book.id())).thenReturn(Optional.of(book));
        when(repository.startPageProcessing(book.id(), 1, true)).thenReturn(Optional.of(pending));
        when(repository.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(analysisClient.analyzePage(any(), eq(1), any()))
            .thenThrow(new RuntimeException("OCR unavailable"));

        var result = service.processPage(book.id(), 1, true);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.FAILED);
        assertThat(result.analysis()).isEqualTo(previousAnalysis);
    }

    @Test
    void analysisFailurePersistsFailedStatus() throws Exception {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key.pdf");
        var pending = BookPage.create(book.id(), 1, 0, 0);
        Files.createDirectories(storagePath.resolve("pdf"));
        Files.createFile(storagePath.resolve("pdf/key-page1-300dpi.png"));
        when(repository.findById(book.id())).thenReturn(Optional.of(book));
        when(repository.startPageProcessing(book.id(), 1, false)).thenReturn(Optional.of(pending));
        when(repository.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(analysisClient.analyzePage(any(), eq(1), any())).thenThrow(new RuntimeException("OCR unavailable"));

        var result = service.processPage(book.id(), 1);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.FAILED);
        assertThat(result.failureReason()).isEqualTo("OCR unavailable");
        verify(analysisClient).analyzePage(any(), eq(1), any());
        verify(analysisClient, never()).detectInteractions(any(), any());
    }

    @Test
    void blankDetectionFailurePersistsFailedStatus() throws Exception {
        var book = Book.create("Test", "test.pdf", "application/pdf", 100, "abc", 10, "de", "key.pdf");
        var pending = BookPage.create(book.id(), 1, 0, 0);
        Files.createDirectories(storagePath.resolve("pdf"));
        Files.createFile(storagePath.resolve("pdf/key-page1-300dpi.png"));
        when(repository.findById(book.id())).thenReturn(Optional.of(book));
        when(repository.startPageProcessing(book.id(), 1, false)).thenReturn(Optional.of(pending));
        when(repository.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var ocr = analysis(List.of());
        when(analysisClient.analyzePage(any(), eq(1), any())).thenReturn(ocr);
        when(analysisClient.detectInteractions(any(), eq(ocr)))
            .thenThrow(new RuntimeException("Blank detector unavailable"));

        var result = service.processPage(book.id(), 1);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.FAILED);
        assertThat(result.failureReason()).isEqualTo("Blank detector unavailable");
        verify(analysisClient).detectInteractions(any(), eq(ocr));
    }

    private static PageAnalysis analysis(List<PageAnalysis.ExerciseBlank> blanks) {
        return new PageAnalysis(
            "0.2.0", 1, 800, 600, "de", List.of(), blanks,
            new PageAnalysis.BlankDetectionMetadata("horizontal-line-v1", 1, blanks.size(), 1),
            List.of(), List.of(), null,
            new PageAnalysis.ProcessorMetadata("test", "1", "model", "de", Map.of(), null, 1)
        );
    }
}
