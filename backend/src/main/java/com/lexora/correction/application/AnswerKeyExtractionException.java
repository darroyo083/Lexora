package com.lexora.correction.application;

public class AnswerKeyExtractionException extends RuntimeException {

    public AnswerKeyExtractionException(String message) {
        super(message);
    }

    public AnswerKeyExtractionException(String message, Throwable cause) {
        super(message, cause);
    }
}
