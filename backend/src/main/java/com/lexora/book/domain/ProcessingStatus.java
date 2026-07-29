package com.lexora.book.domain;

public enum ProcessingStatus {
    UPLOADED,
    PENDING,
    RASTERIZING,
    OCR,
    PERSISTING,
    READY,
    FAILED
}
