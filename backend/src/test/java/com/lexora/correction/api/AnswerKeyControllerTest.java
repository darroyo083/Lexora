package com.lexora.correction.api;

import com.lexora.correction.application.AnswerKeyExtractionException;
import com.lexora.correction.application.AnswerKeyExtractionService;
import com.lexora.correction.application.AnswerKeyService;
import com.lexora.correction.domain.*;
import com.lexora.shared.error.AnswerKeyNotFoundException;
import com.lexora.shared.error.BookNotFoundException;
import com.lexora.shared.error.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AnswerKeyControllerTest {

    private MockMvc mvc;
    private AnswerKeyService answerKeyService;
    private AnswerKeyExtractionService answerKeyExtractionService;

    @BeforeEach
    void setUp() {
        answerKeyService = mock(AnswerKeyService.class);
        answerKeyExtractionService = mock(AnswerKeyExtractionService.class);
        mvc = MockMvcBuilders
            .standaloneSetup(new AnswerKeyController(answerKeyService, answerKeyExtractionService))
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
    void extractWithExistingReadyKeyReturnsInfoWithoutReExtracting() throws Exception {
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
        verifyNoInteractions(answerKeyExtractionService);
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
        verifyNoInteractions(answerKeyExtractionService);
    }

    @Test
    void extractWithNoKeyRunsExtractionSynchronously() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(),
            List.of(new AnswerKeyEntry(1, "1", "FillBlank", 1, "test", List.of(), false, false, "strict", "", 1.0, List.of(), null)),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.empty());
        when(answerKeyExtractionService.extract(bookId, false)).thenReturn(key);

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extractionStatus").value("READY"))
            .andExpect(jsonPath("$.entryCount").value(1))
            .andExpect(jsonPath("$.sourcePageRange").value("201-230"))
            .andExpect(jsonPath("$.entries[0].expectedValue").value("test"));
        verify(answerKeyExtractionService).extract(bookId, false);
    }

    @Test
    void extractWithRefreshTrueRunsReExtraction() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", "201-230",
            ExtractionStatus.READY, null, Instant.now(), List.of(),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));
        when(answerKeyExtractionService.extract(bookId, true)).thenReturn(key);

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId)
                .queryParam("refresh", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extractionStatus").value("READY"));
        verify(answerKeyExtractionService).extract(bookId, true);
    }

    @Test
    void extractWithPendingKeyAndRefreshRunsReExtraction() throws Exception {
        var bookId = UUID.randomUUID();
        var key = new AnswerKey(bookId, "cornelsen", "1.0.0", null,
            ExtractionStatus.PENDING, null, null, List.of(),
            Instant.now(), Instant.now());
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(key));
        when(answerKeyExtractionService.extract(bookId, true)).thenReturn(key);

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId)
                .queryParam("refresh", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extractionStatus").value("PENDING"));
        verify(answerKeyExtractionService).extract(bookId, true);
    }

    @Test
    void extractWithMissingBookReturns404() throws Exception {
        var bookId = UUID.randomUUID();
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.empty());
        when(answerKeyExtractionService.extract(bookId, false))
            .thenThrow(new BookNotFoundException(bookId));

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"));
    }

    @Test
    void extractFailureReturnsFailedWithReason() throws Exception {
        var bookId = UUID.randomUUID();
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.empty());
        when(answerKeyExtractionService.extract(bookId, false))
            .thenThrow(new AnswerKeyExtractionException("OCR service unavailable"));

        mvc.perform(post("/api/books/{bookId}/answer-key/extract", bookId))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.extractionStatus").value("FAILED"))
            .andExpect(jsonPath("$.failureReason").value("OCR service unavailable"));
    }
}
