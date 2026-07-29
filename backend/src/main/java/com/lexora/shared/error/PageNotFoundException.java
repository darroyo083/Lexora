package com.lexora.shared.error;

import java.util.UUID;

public class PageNotFoundException extends RuntimeException {
    public PageNotFoundException(UUID bookId, int page) {
        super("Page not found: book=" + bookId + " page=" + page);
    }
}
