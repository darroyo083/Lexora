package com.lexora.correction.api;

import com.lexora.correction.application.AnswerKeyService;
import com.lexora.correction.domain.*;
import com.lexora.shared.error.AnswerKeyNotFoundException;
import com.lexora.shared.error.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AnswerKeyControllerTest {

    private MockMvc mvc;
    private AnswerKeyService answerKeyService;

    @BeforeEach
    void setUp() {
        answerKeyService = mock(AnswerKeyService.class);
        mvc = MockMvcBuilders
            .standaloneSetup(new AnswerKeyController(answerKeyService))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void getAnswerKeyNotFoundReturns404() throws Exception {
        var bookId = UUID.randomUUID();
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.empty());

        mvc.perform(get("/api/books/{bookId}/answer-key", bookId))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("ANSWER_KEY_NOT_FOUND"));
    }

    @Test
    void getAnswerKeyReadyReturnsOk() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(),
            List.of(new AnswerKeyEntry(1, "1", "FillBlank", 1, "test",
                List.of(), false, false, "strict", "", 1.0, List.of(), null)),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));

        mvc.perform(get("/api/books/{bookId}/answer-key", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extractionStatus").value("READY"))
            .andExpect(jsonPath("$.entryCount").value(1))
            .andExpect(jsonPath("$.entries").isArray())
            .andExpect(jsonPath("$.entries[0].expectedValue").value("test"));
    }

    @Test
    void getAnswerKeyFailedReturnsOkWithFailureInfo() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", null,
            ExtractionStatus.FAILED, "OCR error", null, List.of(),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));

        mvc.perform(get("/api/books/{bookId}/answer-key", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extractionStatus").value("FAILED"))
            .andExpect(jsonPath("$.failureReason").value("OCR error"));
    }

    @Test
    void getAnswerKeyPendingReturnsOkWithPendingStatus() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", null,
            ExtractionStatus.PENDING, null, null, List.of(),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));

        mvc.perform(get("/api/books/{bookId}/answer-key", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extractionStatus").value("PENDING"));
    }

    @Test
    void extractWithExistingKeyReturnsOkWithMessage() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(),
            List.of(new AnswerKeyEntry(1, "1", "FillBlank", 1, "test", List.of(), false, false, "strict", "", 1.0, List.of(), null)),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extractionStatus").value("READY"))
            .andExpect(jsonPath("$.entryCount").value(1));
    }

    @Test
    void extractWithPendingKeyReturnsConflict() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", null,
            ExtractionStatus.PENDING, null, null, List.of(),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.extractionStatus").value("PENDING"));
    }

    @Test
    void extractWithNoKeyReturnsAccepted() throws Exception {
        var bookId = UUID.randomUUID();
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.empty());

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.extractionStatus").value("PENDING"));
    }

    @Test
    void extractWithRefreshTrueReturnsAccepted() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), List.of(),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId)
                .queryParam("refresh", "true"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.extractionStatus").value("PENDING"));
    }

    @Test
    void extractWithPendingKeyAndRefreshReturnsAccepted() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", null,
            ExtractionStatus.PENDING, null, null, List.of(),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId)
                .queryParam("refresh", "true"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.extractionStatus").value("PENDING"));
    }
}
