package com.lexora.book.domain;

import java.time.Instant;
import java.util.UUID;

public record BookPage(
    UUID id,
    UUID bookId,
    int pageNumber,
    int width,
    int height,
    ProcessingStatus processingStatus,
    String analysis,
    Instant processedAt,
    String failureReason
) {
    public static BookPage create(UUID bookId, int pageNumber, int width, int height) {
        return new BookPage(
            UUID.randomUUID(),
            bookId,
            pageNumber,
            width,
            height,
            ProcessingStatus.PENDING,
            null,
            null,
            null
        );
    }

    public BookPage markReady(String analysisJson) {
        return new BookPage(
            id, bookId, pageNumber, width, height,
            ProcessingStatus.READY, analysisJson, Instant.now(), null
        );
    }

    public BookPage transitionTo(ProcessingStatus status) {
        return new BookPage(
            id, bookId, pageNumber, width, height,
            status, analysis, processedAt, null
        );
    }

    public BookPage markFailed(String reason) {
        return new BookPage(
            id, bookId, pageNumber, width, height,
            ProcessingStatus.FAILED, analysis, Instant.now(), reason
        );
    }
}
