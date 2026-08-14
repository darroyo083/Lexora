package com.lexora.assist.client;

/** Provider-bound failure surfaced cleanly, never with raw provider bodies. */
public class AssistUnavailableException extends RuntimeException {
    public AssistUnavailableException(String message) {
        super(message);
    }

    public AssistUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
