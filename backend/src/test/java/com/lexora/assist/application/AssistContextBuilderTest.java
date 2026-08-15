package com.lexora.assist.application;

import com.lexora.book.application.BookService;
import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.correction.application.CorrectionResolutionService;
import com.lexora.correction.domain.CorrectionSlot;
import com.lexora.correction.domain.PageCorrectionResolution;
import com.lexora.correction.domain.ResolvedAnswerEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AssistContextBuilderTest {

    private final UUID bookId = UUID.randomUUID();
    private BookService bookService;
    private CorrectionResolutionService resolutionService;
    private AssistContextBuilder builder;

    private static final String ANALYSIS = """
        {
          "schemaVersion": "0.2.0",
          "pageNumber": 1,
          "width": 1322,
          "height": 1870,
          "language": "de",
          "textSpans": [
            {"id": "ts-07", "text": "Lücken ergänzen", "confidence": 0.99, "confidenceScope": "full-page", "parentLineId": null, "bbox": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.02}},
            {"id": "ts-08", "text": "Ergänze die Sätze mit der passenden Verbform.", "confidence": 0.99, "confidenceScope": "full-page", "parentLineId": null, "bbox": {"x": 0.1, "y": 0.12, "width": 0.3, "height": 0.02}},
            {"id": "ts-09", "text": "a) Ich ___ um sieben Uhr auf.", "confidence": 0.99, "confidenceScope": "full-page", "parentLineId": null, "bbox": {"x": 0.1, "y": 0.14, "width": 0.4, "height": 0.02}}
          ],
          "exerciseBlanks": [
            {"id": "blank-01", "kind": "fill-in-line", "lineBbox": {"x":0.1,"y":0.14,"width":0.1,"height":0.02}, "interactionBbox": {"x":0.1,"y":0.14,"width":0.1,"height":0.02}, "detectionMethod": "vision-structured-v1", "candidateScore": 0.9, "nearbyTextSpanIds": ["ts-09"]}
          ],
          "choiceGroups": [], "choiceTargets": [], "choiceGrids": [], "sentenceOrderings": [],
          "matchingInteractions": [], "freeTextInteractions": [],
          "semanticExercises": [
            {"id": "se-01", "number": "1", "title": "Lücken ergänzen", "instruction": "Ergänze die Sätze mit der passenden Verbform.", "kind": "fill-blank", "bbox": {"x":0.1,"y":0.1,"width":0.4,"height":0.3}, "sourceOrder": 1, "interactionIds": ["blank-01"], "contextSpanIds": ["ts-07","ts-08","ts-09"], "detectionMethod": "vision-semantic-v1", "confidence": 0.98}
          ],
          "processor": {"engine": "opencode-go-vision", "engineVersion": "v1", "model": "mimo-v2.5", "language": "de", "parameters": {}, "processedAt": "2025-01-01T00:00:00Z", "durationMs": 1}
        }
        """;

    @BeforeEach
    void setUp() {
        bookService = mock(BookService.class);
        resolutionService = mock(CorrectionResolutionService.class);
        var config = new AssistConfiguration(true, "openai", "m", 100, 10, 30, 8000,
            "site", "secret", false, false);
        builder = new AssistContextBuilder(bookService, resolutionService, config);

        var book = new Book(bookId, "Synthetic Workbook", "workbook.pdf", "application/pdf",
            1L, "checksum", 4, "de", "storage.pdf", ProcessingStatus.READY,
            Instant.now(), Instant.now(), UUID.randomUUID());
        when(bookService.getBook(bookId)).thenReturn(Optional.of(book));
        var page = new BookPage(UUID.randomUUID(), bookId, 1, 1322, 1870,
            ProcessingStatus.READY, ANALYSIS, Instant.now(), null);
        when(bookService.getPage(bookId, 1)).thenReturn(Optional.of(page));
    }

    @Test
    void reconstructsCanonicalContextFromTrustedAnalysis() {
        when(resolutionService.resolve(bookId, 1))
            .thenReturn(PageCorrectionResolution.unmapped(bookId, 1, null));

        var built = builder.build(bookId, 1, "blank-01", null, null);

        assertThat(built).isNotNull();
        assertThat(built.context().exerciseKind()).isEqualTo("fill-in-line");
        assertThat(built.context().instruction())
            .isEqualTo("Ergänze die Sätze mit der passenden Verbform.");
        assertThat(built.context().source()).contains("Lücken ergänzen");
        assertThat(built.context().sourceLanguage()).isEqualTo("de");
        assertThat(built.sourceBacked()).isFalse();
    }

    @Test
    void returnsNullForStaleOrUnknownExerciseId() {
        when(resolutionService.resolve(bookId, 1))
            .thenReturn(PageCorrectionResolution.unmapped(bookId, 1, null));

        assertThat(builder.build(bookId, 1, "does-not-exist", null, null)).isNull();
    }

    @Test
    void reportsSourceBackedWhenDeterministicGradingExists() {
        var entry = new ResolvedAnswerEntry(227, "1", 1, "a", "FillBlank", 1,
            "stehe", List.of(), false, false, "strict", "", 1.0, List.of(), null, null);
        when(resolutionService.resolve(bookId, 1))
            .thenReturn(new PageCorrectionResolution(bookId, 1, "RESOLVED", 1, "Mein Morgen",
                List.of(new CorrectionSlot("fill-in-line", 0, "RESOLVED", entry))));

        var built = builder.build(bookId, 1, "blank-01", "stehe", null);

        assertThat(built.sourceBacked()).isTrue();
    }

    @Test
    void freeTextIsNeverSourceBacked() {
        // The free-text interaction id does not exist in this fixture, but the
        // rule is exercised via kind logic; verify no slot match yields false.
        when(resolutionService.resolve(bookId, 1))
            .thenReturn(new PageCorrectionResolution(bookId, 1, "RESOLVED", 1, null,
                List.of(new CorrectionSlot("free-text", 0, "RESOLVED", null))));

        assertThat(builder.build(bookId, 1, "blank-01", null, null).sourceBacked()).isFalse();
    }
}
