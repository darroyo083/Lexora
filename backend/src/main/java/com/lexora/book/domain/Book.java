package com.lexora.book.domain;

import java.time.Instant;
import java.util.UUID;

public record Book(
    UUID id,
    String title,
    String originalFilename,
    String mimeType,
    long fileSize,
    String checksum,
    int pageCount,
    String sourceLanguage,
    String storageKey,
    ProcessingStatus status,
    Instant createdAt,
    Instant updatedAt,
    UUID bookProfileId
) {
    public Book(
        UUID id,
        String title,
        String originalFilename,
        String mimeType,
        long fileSize,
        String checksum,
        int pageCount,
        String sourceLanguage,
        String storageKey,
        ProcessingStatus status,
        Instant createdAt,
        Instant updatedAt
    ) {
        this(id, title, originalFilename, mimeType, fileSize, checksum, pageCount,
            sourceLanguage, storageKey, status, createdAt, updatedAt, null);
    }

    public static Book create(
        String title,
        String originalFilename,
        String mimeType,
        long fileSize,
        String checksum,
        int pageCount,
        String sourceLanguage,
        String storageKey
    ) {
        var now = Instant.now();
        return new Book(
            UUID.randomUUID(),
            title,
            originalFilename,
            mimeType,
            fileSize,
            checksum,
            pageCount,
            sourceLanguage,
            storageKey,
            ProcessingStatus.UPLOADED,
            now,
            now
        );
    }

    public Book withBookProfileId(UUID profileId) {
        return new Book(id, title, originalFilename, mimeType, fileSize, checksum,
            pageCount, sourceLanguage, storageKey, status, createdAt, updatedAt, profileId);
    }
}
