package com.lexora.correction.application;

import com.lexora.book.application.BookService;
import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.PageRange;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.domain.UnitRef;
import com.lexora.book.infrastructure.BookProfileRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.documentanalysis.client.DocumentAnalysisClient;
import com.lexora.documentanalysis.contract.ExtractAnswerKeyResponse;
import com.lexora.shared.error.BookNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class AnswerKeyExtractionServiceTest {

    private BookService bookService;
    private DocumentAnalysisClient analysisClient;
    private AnswerKeyService answerKeyService;
    private BookProfileRepository bookProfileRepository;
    private AnswerKeyExtractionService service;

    private final UUID bookId = UUID.randomUUID();
    private final AnswerKeyEntry entry = new AnswerKeyEntry(
        1, "12", "FillBlank", 1, "der Hund", List.of(),
        false, false, "strict", "", 1.0, List.of(), null);

    @BeforeEach
    void setUp() {
        bookService = mock(BookService.class);
        analysisClient = mock(DocumentAnalysisClient.class);
        answerKeyService = mock(AnswerKeyService.class);
        bookProfileRepository = mock(BookProfileRepository.class);
        service = new AnswerKeyExtractionService(
            bookService, analysisClient, answerKeyService, bookProfileRepository, 30);
    }

    private Book book(int pageCount) {
        return new Book(bookId, "Test", "test.pdf", "application/pdf", 100, "abc",
            pageCount, "de", "key.pdf", ProcessingStatus.UPLOADED, Instant.now(), Instant.now());
    }

    private void stubBook(int pageCount, List<Path> rasters) throws IOException {
        when(bookService.getBook(bookId)).thenReturn(Optional.of(book(pageCount)));
        when(bookService.getBookSource(bookId)).thenReturn(Path.of("storage/key.pdf"));
        when(bookService.rasterizePages(any(), anyInt(), anyInt())).thenReturn(rasters);
    }

    private AnswerKey readyKey() {
        return new AnswerKey(bookId, "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), List.of(entry), Instant.now(), Instant.now());
    }

    @Test
    void extractRunsFullChainAndPersistsReady() throws Exception {
        var rasters = List.of(Path.of("storage/key-page201-300dpi.png"));
        stubBook(230, rasters);
        var response = new ExtractAnswerKeyResponse(bookId.toString(), "cornelsen", "1.0.0", "201-230",
            List.of(entry), 1);
        when(analysisClient.extractAnswerKey(eq(bookId.toString()), eq(rasters), eq("cornelsen")))
            .thenReturn(response);
        when(answerKeyService.extractAnswerKey(eq(bookId), eq("cornelsen"), eq("1.0.0"), eq("201-230"), any()))
            .thenReturn(readyKey());

        var result = service.extract(bookId, false);

        assertThat(result.extractionStatus()).isEqualTo(ExtractionStatus.READY);
        verify(bookService).rasterizePages(any(), eq(201), eq(230));
        verify(analysisClient).extractAnswerKey(bookId.toString(), rasters, "cornelsen");
        verify(answerKeyService).extractAnswerKey(bookId, "cornelsen", "1.0.0", "201-230", List.of(entry));
        verify(answerKeyService, never()).extractAnswerKeyRefresh(any(), any(), any(), any(), any());
        verify(answerKeyService, never()).markFailed(any(), any(), any(), any(), any());
    }

    @Test
    void extractWithRefreshUsesRefreshPersistence() throws Exception {
        var rasters = List.of(Path.of("storage/key-page201-300dpi.png"));
        stubBook(230, rasters);
        var response = new ExtractAnswerKeyResponse(bookId.toString(), "cornelsen", "1.0.0", "201-230",
            List.of(entry), 1);
        when(analysisClient.extractAnswerKey(any(), any(), any())).thenReturn(response);
        when(answerKeyService.extractAnswerKeyRefresh(eq(bookId), eq("cornelsen"), eq("1.0.0"), eq("201-230"), any()))
            .thenReturn(readyKey());

        var result = service.extract(bookId, true);

        assertThat(result.extractionStatus()).isEqualTo(ExtractionStatus.READY);
        verify(answerKeyService).extractAnswerKeyRefresh(bookId, "cornelsen", "1.0.0", "201-230", List.of(entry));
        verify(answerKeyService, never()).extractAnswerKey(any(), any(), any(), any(), any());
    }

    @Test
    void extractThrowsBookNotFoundWhenBookMissing() throws Exception {
        when(bookService.getBook(bookId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.extract(bookId, false))
            .isInstanceOf(BookNotFoundException.class);
        verifyNoInteractions(analysisClient);
        verifyNoInteractions(answerKeyService);
    }

    @Test
    void aiFailurePersistsFailedWithReason() throws Exception {
        var rasters = List.of(Path.of("storage/key-page201-300dpi.png"));
        stubBook(230, rasters);
        when(analysisClient.extractAnswerKey(any(), any(), any()))
            .thenThrow(new RuntimeException("OCR service unavailable"));

        assertThatThrownBy(() -> service.extract(bookId, false))
            .isInstanceOf(AnswerKeyExtractionException.class)
            .hasMessage("OCR service unavailable");

        verify(answerKeyService).markFailed(bookId, "cornelsen", "unknown", "201-230", "OCR service unavailable");
        verify(answerKeyService, never()).extractAnswerKey(any(), any(), any(), any(), any());
    }

    @Test
    void refreshFailureRetainsPreviousKnownGoodKey() throws Exception {
        var rasters = List.of(Path.of("storage/key-page201-300dpi.png"));
        stubBook(230, rasters);
        when(analysisClient.extractAnswerKey(any(), any(), any()))
            .thenThrow(new RuntimeException("OCR service unavailable"));
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(readyKey()));

        assertThatThrownBy(() -> service.extract(bookId, true))
            .isInstanceOf(AnswerKeyExtractionException.class)
            .hasMessage("OCR service unavailable");

        verify(answerKeyService, never()).markFailed(any(), any(), any(), any(), any());
        verify(answerKeyService, never()).extractAnswerKeyRefresh(any(), any(), any(), any(), any());
    }

    @Test
    void refreshFailureWithoutPreviousKeyPersistsFailed() throws Exception {
        var rasters = List.of(Path.of("storage/key-page201-300dpi.png"));
        stubBook(230, rasters);
        when(analysisClient.extractAnswerKey(any(), any(), any()))
            .thenThrow(new RuntimeException("OCR service unavailable"));
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.extract(bookId, true))
            .isInstanceOf(AnswerKeyExtractionException.class);

        verify(answerKeyService).markFailed(bookId, "cornelsen", "unknown", "201-230", "OCR service unavailable");
    }

    @Test
    void emptyEntriesAreTreatedAsFailure() throws Exception {
        var rasters = List.of(Path.of("storage/key-page201-300dpi.png"));
        stubBook(230, rasters);
        var response = new ExtractAnswerKeyResponse(bookId.toString(), "cornelsen", "1.0.0", "201-230",
            List.of(), 0);
        when(analysisClient.extractAnswerKey(any(), any(), any())).thenReturn(response);

        assertThatThrownBy(() -> service.extract(bookId, false))
            .isInstanceOf(AnswerKeyExtractionException.class)
            .hasMessage("AI service returned no answer key entries");

        verify(answerKeyService).markFailed(bookId, "cornelsen", "unknown", "201-230",
            "AI service returned no answer key entries");
        verify(answerKeyService, never()).extractAnswerKey(any(), any(), any(), any(), any());
    }

    @Test
    void rasterizationFailurePersistsFailed() throws Exception {
        when(bookService.getBook(bookId)).thenReturn(Optional.of(book(230)));
        when(bookService.getBookSource(bookId)).thenReturn(Path.of("storage/key.pdf"));
        when(bookService.rasterizePages(any(), anyInt(), anyInt()))
            .thenThrow(new IOException("PDF corrupt"));

        assertThatThrownBy(() -> service.extract(bookId, false))
            .isInstanceOf(AnswerKeyExtractionException.class)
            .hasMessage("PDF corrupt");

        verify(answerKeyService).markFailed(bookId, "cornelsen", "unknown", "201-230", "PDF corrupt");
        verifyNoInteractions(analysisClient);
    }

    @Test
    void responseWithoutParserVersionFallsBack() throws Exception {
        var rasters = List.of(Path.of("storage/key-page201-300dpi.png"));
        stubBook(230, rasters);
        var response = new ExtractAnswerKeyResponse(bookId.toString(), null, null, "201-230",
            List.of(entry), 1);
        when(analysisClient.extractAnswerKey(any(), any(), any())).thenReturn(response);
        when(answerKeyService.extractAnswerKey(eq(bookId), eq("cornelsen"), eq("unknown"), eq("201-230"), any()))
            .thenReturn(readyKey());

        service.extract(bookId, false);

        verify(answerKeyService).extractAnswerKey(bookId, "cornelsen", "unknown", "201-230", List.of(entry));
    }

    @Test
    void resolvePageRangeUsesLastThirtyPagesByDefault() {
        assertThat(AnswerKeyExtractionService.resolvePageRange(230, 30).toString()).isEqualTo("201-230");
        assertThat(AnswerKeyExtractionService.resolvePageRange(31, 30).toString()).isEqualTo("2-31");
        assertThat(AnswerKeyExtractionService.resolvePageRange(30, 30).toString()).isEqualTo("1-30");
        assertThat(AnswerKeyExtractionService.resolvePageRange(10, 30).toString()).isEqualTo("1-10");
        assertThat(AnswerKeyExtractionService.resolvePageRange(1, 30).toString()).isEqualTo("1-1");
    }

    @Test
    void profilePresentRasterizesProfileLoesungenRange() throws Exception {
        var profileId = UUID.randomUUID();
        var profile = new BookProfile(profileId, "synthetic", "synthetic-workbook-v1",
            2, List.of(), new PageRange(18, 20), List.of());
        var rasters = List.of(Path.of("storage/key-page18-300dpi.png"));
        when(bookService.getBook(bookId)).thenReturn(Optional.of(book(230).withBookProfileId(profileId)));
        when(bookService.getBookSource(bookId)).thenReturn(Path.of("storage/key.pdf"));
        when(bookProfileRepository.findById(profileId)).thenReturn(Optional.of(profile));
        when(bookService.rasterizePages(any(), anyInt(), anyInt())).thenReturn(rasters);
        var response = new ExtractAnswerKeyResponse(bookId.toString(), "cornelsen", "1.0.0", "18-20",
            List.of(entry), 1);
        when(analysisClient.extractAnswerKey(any(), any(), any())).thenReturn(response);
        when(answerKeyService.extractAnswerKey(eq(bookId), eq("cornelsen"), eq("1.0.0"), eq("18-20"), any()))
            .thenReturn(readyKey());

        var result = service.extract(bookId, false);

        assertThat(result.extractionStatus()).isEqualTo(ExtractionStatus.READY);
        verify(bookService).rasterizePages(any(), eq(18), eq(20));
        verify(answerKeyService).extractAnswerKey(bookId, "cornelsen", "1.0.0", "18-20", List.of(entry));
    }

    @Test
    void bookWithProfileIdButMissingProfileFallsBackToLegacyRange() throws Exception {
        var profileId = UUID.randomUUID();
        when(bookService.getBook(bookId)).thenReturn(Optional.of(book(230).withBookProfileId(profileId)));
        when(bookService.getBookSource(bookId)).thenReturn(Path.of("storage/key.pdf"));
        when(bookProfileRepository.findById(profileId)).thenReturn(Optional.empty());
        when(bookService.rasterizePages(any(), anyInt(), anyInt())).thenReturn(List.of());
        var response = new ExtractAnswerKeyResponse(bookId.toString(), "cornelsen", "1.0.0", "201-230",
            List.of(entry), 1);
        when(analysisClient.extractAnswerKey(any(), any(), any())).thenReturn(response);
        when(answerKeyService.extractAnswerKey(eq(bookId), eq("cornelsen"), eq("1.0.0"), eq("201-230"), any()))
            .thenReturn(readyKey());

        service.extract(bookId, false);

        verify(bookService).rasterizePages(any(), eq(201), eq(230));
    }
}
