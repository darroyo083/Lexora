package com.lexora.shared.error;

import java.util.UUID;

public class AnswerKeyNotFoundException extends RuntimeException {
    public AnswerKeyNotFoundException(UUID bookId) {
        super("Answer key not found for book: " + bookId);
    }
}
