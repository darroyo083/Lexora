package com.lexora.correction.application;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.correction.domain.*;
import com.lexora.correction.infrastructure.AnswerKeyRepository;
import com.lexora.shared.error.AnswerKeyNotFoundException;
import com.lexora.shared.error.BookNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AnswerKeyServiceTest {

    private AnswerKeyRepository answerKeyRepository;
    private BookRepository bookRepository;
    private AnswerKeyService service;

    @BeforeEach
    void setUp() {
        answerKeyRepository = mock(AnswerKeyRepository.class);
        bookRepository = mock(BookRepository.class);
        service = new AnswerKeyService(answerKeyRepository, bookRepository);
    }

    @Test
    void getAnswerKeyReturnsKeyWhenPresent() {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), List.of(),
            Instant.now(), Instant.now());
        when(answerKeyRepository.findByBookId(bookId)).thenReturn(Optional.of(key));

        var result = service.getAnswerKey(bookId);
        assertThat(result).isEqualTo(key);
    }

    @Test
    void getAnswerKeyThrowsWhenAbsent() {
        var bookId = UUID.randomUUID();
        when(answerKeyRepository.findByBookId(bookId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getAnswerKey(bookId))
            .isInstanceOf(AnswerKeyNotFoundException.class);
    }

    @Test
    void findAnswerKeyReturnsEmptyWhenAbsent() {
        var bookId = UUID.randomUUID();
        when(answerKeyRepository.findByBookId(bookId)).thenReturn(Optional.empty());

        assertThat(service.findAnswerKey(bookId)).isEmpty();
    }

    @Test
    void extractAnswerKeySavesWhenBookExists() {
        var bookId = UUID.randomUUID();
        var book = new Book(bookId, "Test", "test.pdf", "application/pdf", 100, "abc",
            10, "de", "key", ProcessingStatus.UPLOADED, Instant.now(), Instant.now());
        when(bookRepository.findById(bookId)).thenReturn(Optional.of(book));

        var entries = List.of(
            new AnswerKeyEntry(1, "1", "FillBlank", 1, "a", List.of(), false, false, "strict", "", 1.0, List.of(), null)
        );
        var result = service.extractAnswerKey(bookId, "cornelsen", "1.0.0", "201-230", entries);

        assertThat(result.extractionStatus()).isEqualTo(ExtractionStatus.READY);
        assertThat(result.entries()).hasSize(1);
        verify(answerKeyRepository).save(any(AnswerKey.class));
    }

    @Test
    void extractAnswerKeyThrowsWhenBookNotFound() {
        var bookId = UUID.randomUUID();
        when(bookRepository.findById(bookId)).thenReturn(Optional.empty());

        assertThatThrownBy(() ->
            service.extractAnswerKey(bookId, "cornelsen", "1.0.0", "201-230", List.of()))
            .isInstanceOf(BookNotFoundException.class);
        verify(answerKeyRepository, never()).save(any());
    }

    @Test
    void extractRefreshReplacesExistingKey() {
        var bookId = UUID.randomUUID();
        var book = new Book(bookId, "Test", "test.pdf", "application/pdf", 100, "abc",
            10, "de", "key", ProcessingStatus.UPLOADED, Instant.now(), Instant.now());
        var existingKey = new AnswerKey(bookId, "stub", "0.1.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), List.of(),
            Instant.now(), Instant.now());
        when(bookRepository.findById(bookId)).thenReturn(Optional.of(book));
        when(answerKeyRepository.findByBookId(bookId)).thenReturn(Optional.of(existingKey));

        var newEntries = List.of(
            new AnswerKeyEntry(1, "1", "FillBlank", 1, "new", List.of(), false, false, "strict", "", 1.0, List.of(), null)
        );
        var result = service.extractAnswerKeyRefresh(bookId, "cornelsen", "1.0.0", "201-230", newEntries);

        assertThat(result.extractionStatus()).isEqualTo(ExtractionStatus.READY);
        assertThat(result.extractionMethod()).isEqualTo("cornelsen");
        assertThat(result.entries()).hasSize(1);
        verify(answerKeyRepository).save(any(AnswerKey.class));
    }

    @Test
    void extractRefreshRetainsPreviousKeyOnFailure() {
        var bookId = UUID.randomUUID();
        var book = new Book(bookId, "Test", "test.pdf", "application/pdf", 100, "abc",
            10, "de", "key", ProcessingStatus.UPLOADED, Instant.now(), Instant.now());
        var existingEntry = new AnswerKeyEntry(1, "1", "FillBlank", 1, "old", List.of(), false, false, "strict", "", 1.0, List.of(), null);
        var existingKey = new AnswerKey(bookId, "stub", "0.1.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(),
            List.of(existingEntry),
            Instant.now(), Instant.now());
        when(bookRepository.findById(bookId)).thenReturn(Optional.of(book));
        when(answerKeyRepository.findByBookId(bookId)).thenReturn(Optional.of(existingKey));
        doThrow(new RuntimeException("DB error")).when(answerKeyRepository).save(any(AnswerKey.class));

        var newEntries = List.of(
            new AnswerKeyEntry(1, "1", "FillBlank", 1, "new", List.of(), false, false, "strict", "", 1.0, List.of(), null)
        );

        var result = service.extractAnswerKeyRefresh(bookId, "cornelsen", "1.0.0", "201-230", newEntries);
        assertThat(result).isSameAs(existingKey);
        assertThat(result.entries().get(0).expectedValue()).isEqualTo("old");
    }

    @Test
    void extractRefreshWithNoPreviousKeyFailsAndSavesFailedStatus() {
        var bookId = UUID.randomUUID();
        var book = new Book(bookId, "Test", "test.pdf", "application/pdf", 100, "abc",
            10, "de", "key", ProcessingStatus.UPLOADED, Instant.now(), Instant.now());
        when(bookRepository.findById(bookId)).thenReturn(Optional.of(book));
        when(answerKeyRepository.findByBookId(bookId)).thenReturn(Optional.empty());
        doThrow(new RuntimeException("Extraction error")).when(answerKeyRepository).save(any(AnswerKey.class));

        assertThatThrownBy(() ->
            service.extractAnswerKeyRefresh(bookId, "cornelsen", "1.0.0", "201-230", List.of()))
            .isInstanceOf(RuntimeException.class);
    }

    @Test
    void markFailedPersistsFailedStatusWithReason() {
        var bookId = UUID.randomUUID();
        var book = new Book(bookId, "Test", "test.pdf", "application/pdf", 100, "abc",
            10, "de", "key", ProcessingStatus.UPLOADED, Instant.now(), Instant.now());
        when(bookRepository.findById(bookId)).thenReturn(Optional.of(book));

        var result = service.markFailed(bookId, "cornelsen", "unknown", "201-230", "OCR down");

        assertThat(result.extractionStatus()).isEqualTo(ExtractionStatus.FAILED);
        assertThat(result.failureReason()).isEqualTo("OCR down");
        assertThat(result.sourcePageRange()).isEqualTo("201-230");
        assertThat(result.extractedAt()).isNull();
        verify(answerKeyRepository).save(any(AnswerKey.class));
    }

    @Test
    void markFailedThrowsWhenBookNotFound() {
        var bookId = UUID.randomUUID();
        when(bookRepository.findById(bookId)).thenReturn(Optional.empty());

        assertThatThrownBy(() ->
            service.markFailed(bookId, "cornelsen", "unknown", "201-230", "OCR down"))
            .isInstanceOf(BookNotFoundException.class);
        verify(answerKeyRepository, never()).save(any());
    }
}
