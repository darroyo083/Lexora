package com.lexora.book.domain;

public enum ProcessingStatus {
    UPLOADED,
    PENDING,
    RASTERIZING,
    OCR,
    DETECTING_INTERACTIONS,
    PERSISTING,
    READY,
    FAILED
}
