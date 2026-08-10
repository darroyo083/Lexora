package com.lexora.shared.error;

import org.apache.catalina.connector.ClientAbortException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.io.IOException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BookNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiError handleBookNotFound(BookNotFoundException e) {
        return ApiError.of("BOOK_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(AnswerKeyNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiError handleAnswerKeyNotFound(AnswerKeyNotFoundException e) {
        return ApiError.of("ANSWER_KEY_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(PageNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiError handlePageNotFound(PageNotFoundException e) {
        return ApiError.of("PAGE_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError handleBadRequest(IllegalArgumentException e) {
        log.info("rejecting invalid request: {}", e.getMessage());
        return ApiError.of("BAD_REQUEST", "The request is invalid");
    }

    @ExceptionHandler({HttpMessageNotWritableException.class, ClientAbortException.class})
    public ResponseEntity<ApiError> handleResponseWriteFailure(Exception e) {
        if (isClientDisconnect(e)) {
            // The analysis itself was already persisted server-side; only the
            // response could not be delivered because the browser navigated
            // away or closed the tab. This is expected, not an application
            // failure, so it must not surface as an unhandled error.
            log.info("client disconnected while the response was being written "
                + "(expected after navigation): {}", e.getMessage());
            return ResponseEntity.noContent().build();
        }
        log.error("unhandled error", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiError.of("INTERNAL_ERROR", "An unexpected error occurred"));
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiError handleGeneral(Exception e) {
        log.error("unhandled error", e);
        return ApiError.of("INTERNAL_ERROR", "An unexpected error occurred");
    }

    static boolean isClientDisconnect(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            if (t instanceof ClientAbortException) return true;
            if (t instanceof IOException && "Broken pipe".equals(t.getMessage())) {
                return true;
            }
        }
        return false;
    }
}
