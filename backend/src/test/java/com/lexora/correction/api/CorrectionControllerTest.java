package com.lexora.correction.api;

import com.lexora.correction.application.CorrectionResolutionService;
import com.lexora.correction.domain.CorrectionSlot;
import com.lexora.correction.domain.PageCorrectionResolution;
import com.lexora.correction.domain.ResolvedAnswerEntry;
import com.lexora.shared.error.BookNotFoundException;
import com.lexora.shared.error.GlobalExceptionHandler;
import com.lexora.shared.error.PageNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CorrectionControllerTest {

    private MockMvc mvc;
    private CorrectionResolutionService resolutionService;

    private final UUID bookId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        resolutionService = mock(CorrectionResolutionService.class);
        mvc = MockMvcBuilders
            .standaloneSetup(new CorrectionController(resolutionService))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void resolvedPageReturnsSlotsShape() throws Exception {
        var entry = new ResolvedAnswerEntry(227, "1", 4, "1", "FillBlank", 1,
            "der Hund", List.of(), false, false, "strict", "", 1.0, List.of(), null, null);
        var resolution = new PageCorrectionResolution(bookId, 12, "RESOLVED", 4, "Satzklammer",
            List.of(new CorrectionSlot("fill-in-line", 0, "RESOLVED", entry)));
        when(resolutionService.resolve(bookId, 12)).thenReturn(resolution);

        mvc.perform(get("/api/books/{bookId}/pages/12/correction", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookId").value(bookId.toString()))
            .andExpect(jsonPath("$.pageNumber").value(12))
            .andExpect(jsonPath("$.status").value("RESOLVED"))
            .andExpect(jsonPath("$.unitNumber").value(4))
            .andExpect(jsonPath("$.unitTitle").value("Satzklammer"))
            .andExpect(jsonPath("$.slots.length()").value(1))
            .andExpect(jsonPath("$.slots[0].interactionKind").value("fill-in-line"))
            .andExpect(jsonPath("$.slots[0].ordinal").value(0))
            .andExpect(jsonPath("$.slots[0].resolution").value("RESOLVED"))
            .andExpect(jsonPath("$.slots[0].entry.expectedValue").value("der Hund"))
            .andExpect(jsonPath("$.slots[0].entry.unitNumber").value(4));
    }

    @Test
    void unmappedPageIsAValid200Answer() throws Exception {
        when(resolutionService.resolve(bookId, 5))
            .thenReturn(PageCorrectionResolution.unmapped(bookId, 5, null));

        mvc.perform(get("/api/books/{bookId}/pages/5/correction", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UNMAPPED"))
            .andExpect(jsonPath("$.unitNumber").isEmpty())
            .andExpect(jsonPath("$.slots.length()").value(0));
    }

    @Test
    void ambiguousPageStatusIsReturned() throws Exception {
        when(resolutionService.resolve(bookId, 12))
            .thenReturn(new PageCorrectionResolution(bookId, 12, "AMBIGUOUS", 4,
                List.of(new CorrectionSlot("fill-in-line", 0, "AMBIGUOUS", null))));

        mvc.perform(get("/api/books/{bookId}/pages/12/correction", bookId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("AMBIGUOUS"))
            .andExpect(jsonPath("$.slots[0].resolution").value("AMBIGUOUS"))
            .andExpect(jsonPath("$.slots[0].entry").isEmpty());
    }

    @Test
    void unknownBookReturns404() throws Exception {
        when(resolutionService.resolve(bookId, 12))
            .thenThrow(new BookNotFoundException(bookId));

        mvc.perform(get("/api/books/{bookId}/pages/12/correction", bookId))
            .andExpect(status().isNotFound());
    }

    @Test
    void unknownPageReturns404() throws Exception {
        when(resolutionService.resolve(bookId, 999))
            .thenThrow(new PageNotFoundException(bookId, 999));

        mvc.perform(get("/api/books/{bookId}/pages/999/correction", bookId))
            .andExpect(status().isNotFound());
    }
}
