package com.lexora.shared.error;

import org.apache.catalina.connector.ClientAbortException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotWritableException;

import java.io.IOException;

import static com.lexora.shared.error.GlobalExceptionHandler.isClientDisconnect;
import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void treatsBrokenPipeDuringResponseWriteAsExpectedClientDisconnect() {
        var failure = new HttpMessageNotWritableException(
            "Could not write JSON: ServletOutputStream failed to write",
            new ClientAbortException(new IOException("Broken pipe"))
        );

        assertThat(isClientDisconnect(failure)).isTrue();
        var response = handler.handleResponseWriteFailure(failure);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(response.getBody()).isNull();
    }

    @Test
    void treatsPlainBrokenPipeIOExceptionAsClientDisconnect() {
        assertThat(isClientDisconnect(new IOException("Broken pipe"))).isTrue();
    }

    @Test
    void treatsClientAbortExceptionAsClientDisconnect() {
        assertThat(isClientDisconnect(new ClientAbortException(new IOException("Broken pipe"))))
            .isTrue();
    }

    @Test
    void keepsGenuineResponseWriteFailuresAsInternalErrors() {
        var failure = new HttpMessageNotWritableException("Serialization failed");

        assertThat(isClientDisconnect(failure)).isFalse();
        var response = handler.handleResponseWriteFailure(failure);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("INTERNAL_ERROR");
    }

    @Test
    void keepsUnrelatedExceptionsAsInternalErrors() {
        var response = handler.handleResponseWriteFailure(new IllegalStateException("boom"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().code()).isEqualTo("INTERNAL_ERROR");
    }
}
