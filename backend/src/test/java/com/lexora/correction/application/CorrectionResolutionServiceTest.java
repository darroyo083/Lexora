package com.lexora.correction.application;

import com.lexora.book.application.BookProfileFixtures;
import com.lexora.book.application.BookProfileResolutionService;
import com.lexora.book.application.BookService;
import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookProfileRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.CorrectionSlot;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.correction.domain.PageCorrectionResolution;
import com.lexora.documentanalysis.contract.PageAnalysis;
import com.lexora.shared.error.BookNotFoundException;
import com.lexora.shared.error.PageNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CorrectionResolutionServiceTest {

    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    private final UUID bookId = UUID.randomUUID();
    private final BookProfile profile = BookProfileFixtures.realGrammatikAktivProfile();

    private BookService bookService;
    private BookProfileRepository bookProfileRepository;
    private AnswerKeyService answerKeyService;
    private CorrectionResolutionService service;

    @BeforeEach
    void setUp() {
        bookService = mock(BookService.class);
        bookProfileRepository = mock(BookProfileRepository.class);
        answerKeyService = mock(AnswerKeyService.class);
        service = new CorrectionResolutionService(
            bookService, bookProfileRepository, new BookProfileResolutionService(), answerKeyService);
    }

    private void stubBook(UUID profileId) {
        var book = new Book(bookId, "Grammatik aktiv", "grammatik.pdf", "application/pdf",
            30267288, "abc", 256, "de", "key.pdf", ProcessingStatus.UPLOADED,
            Instant.now(), Instant.now(), profileId);
        when(bookService.getBook(bookId)).thenReturn(Optional.of(book));
    }

    private void stubProfile() {
        stubBook(profile.id());
        when(bookProfileRepository.findById(profile.id())).thenReturn(Optional.of(profile));
    }

    private void stubKey(List<AnswerKeyEntry> entries) {
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.of(
            new AnswerKey(bookId, "cornelsen", "1.0.0", "198-230",
                ExtractionStatus.READY, null, Instant.now(), entries, Instant.now(), Instant.now())));
    }

    private void stubPage(int pageNumber, PageAnalysis analysis) {
        when(bookService.getPage(bookId, pageNumber)).thenReturn(Optional.of(
            new com.lexora.book.domain.BookPage(UUID.randomUUID(), bookId, pageNumber,
                800, 600, ProcessingStatus.READY, JSON.writeValueAsString(analysis), null, null)));
    }

    private static AnswerKeyEntry entry(int pageNumber, String exerciseNumber, String kind,
                                        int ordinal, String expectedValue, Integer unitNumber,
                                        String subExerciseMarker, List<String> items) {
        return new AnswerKeyEntry(pageNumber, exerciseNumber, kind, ordinal, expectedValue,
            List.of(), false, false, "strict", "", 1.0, List.of(), null,
            unitNumber, subExerciseMarker, items);
    }

    private static PageAnalysis analysis(int pageNumber, List<PageAnalysis.ExerciseBlank> blanks,
                                         List<PageAnalysis.ChoiceTarget> choices,
                                         List<PageAnalysis.ChoiceGrid> grids,
                                         List<PageAnalysis.FreeTextInteraction> freeTexts) {
        return new PageAnalysis("0.2.0", pageNumber, 800, 600, "de", List.of(),
            blanks, new PageAnalysis.BlankDetectionMetadata("horizontal-line-v1", blanks.size(), blanks.size(), 1),
            List.of(), choices, new PageAnalysis.ChoiceDetectionMetadata("v1", choices.size(), choices.size(), choices.size(), 1),
            grids, new PageAnalysis.ChoiceGridDetectionMetadata("v1", grids.size(), grids.size(), grids.size(), 1),
            List.of(), null, List.of(), null,
            freeTexts, new PageAnalysis.FreeTextDetectionMetadata("v1", freeTexts.size(), freeTexts.size(), freeTexts.size(), 1),
            new PageAnalysis.ProcessorMetadata("test", "1", "model", "de", Map.of(), null, 1));
    }

    private static PageAnalysis.ExerciseBlank blank(String id) {
        return new PageAnalysis.ExerciseBlank(id, "fill-in-line",
            new PageAnalysis.BBox(0.1, 0.2, 0.3, 0.01),
            new PageAnalysis.BBox(0.1, 0.18, 0.3, 0.05),
            "horizontal-line-v1", 0.9, List.of());
    }

    private static PageAnalysis.ChoiceTarget choice(String id) {
        return new PageAnalysis.ChoiceTarget(id, "choice",
            new PageAnalysis.BBox(0.1, 0.2, 0.3, 0.01),
            new PageAnalysis.BBox(0.1, 0.18, 0.3, 0.05),
            "group-1", "detector-v1", 0.9, List.of());
    }

    private static PageAnalysis.ChoiceGrid grid(String id) {
        return new PageAnalysis.ChoiceGrid(id, "choice-grid",
            new PageAnalysis.BBox(0.1, 0.2, 0.3, 0.05), "group-1",
            "detector-v1", 0.9, List.of());
    }

    @Test
    void bookWithoutProfileResolvesUnmappedWithEmptySlots() {
        stubBook(null);

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isNull();
        assertThat(result.slots()).isEmpty();
        verifyNoInteractions(answerKeyService);
    }

    @Test
    void unknownProfileResolvesUnmapped() {
        stubBook(UUID.randomUUID());
        when(bookProfileRepository.findById(any())).thenReturn(Optional.empty());

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isNull();
    }

    @Test
    void partnerseitenPageResolvesUnmapped() {
        stubProfile();

        var result = service.resolve(bookId, 155);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isNull();
    }

    @Test
    void loesungenPageResolvesUnmapped() {
        stubProfile();

        var result = service.resolve(bookId, 198);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isNull();
    }

    @Test
    void pageWithoutUnitResolvesUnmapped() {
        stubProfile();

        var result = service.resolve(bookId, 5);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isNull();
    }

    @Test
    void missingAnswerKeyResolvesUnmappedWithUnitNumber() {
        stubProfile();
        when(answerKeyService.findAnswerKey(bookId)).thenReturn(Optional.empty());

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isEqualTo(4);
        assertThat(result.slots()).isEmpty();
    }

    @Test
    void unitWithoutEntriesResolvesUnmappedWithUnitNumber() {
        stubProfile();
        stubKey(List.of(entry(228, "1", "FillBlank", 1, "x", 2, "1", List.of())));

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isEqualTo(4);
        assertThat(result.slots()).isEmpty();
    }

    @Test
    void singleItemBlockIsNeverCountAssignedToInteractions() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "der Hund", 4, "1", List.of())));
        stubPage(12, analysis(12, List.of(blank("b1")), List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        // A single-item block's expected value is often a whole answer list;
        // count-assigning it would risk silent wrong grading. Fail closed.
        assertThat(result.status()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(result.unitNumber()).isEqualTo(4);
        assertThat(result.slots()).hasSize(1);
        assertThat(result.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(result.slots().get(0).entry()).isNull();
    }

    @Test
    void itemBlockMustFitEntirelyWithinOnePage() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "a,b,c", 4, "1",
            List.of("a", "b", "c"))));
        stubPage(12, analysis(12, List.of(blank("b1"), blank("b2")), List.of(), List.of(), List.of()));
        stubPage(13, analysis(13, List.of(blank("b3")), List.of(), List.of(), List.of()));

        var first = service.resolve(bookId, 12);

        // 3 items cannot fit page 12's 2 blanks: the block is carried to the
        // next page and page 12's remainder is AMBIGUOUS (fail-closed).
        assertThat(first.status()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(first.slots()).hasSize(2);
        assertThat(first.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(first.slots().get(0).entry()).isNull();

        var second = service.resolve(bookId, 13);

        // Nor page 13's single blank: 3 > 1, still ambiguous.
        assertThat(second.status()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(second.slots()).hasSize(1);
        assertThat(second.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(second.slots().get(0).entry()).isNull();
    }

    @Test
    void itemBlockFittingAPageResolvesOnThatPage() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "a,b,c", 4, "1",
            List.of("a", "b", "c"))));
        stubPage(12, analysis(12, List.of(blank("b1"), blank("b2"), blank("b3")),
            List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots()).hasSize(3);
        assertThat(result.slots().get(0).entry().expectedValue()).isEqualTo("a");
        assertThat(result.slots().get(0).entry().itemIndex()).isZero();
        assertThat(result.slots().get(1).entry().expectedValue()).isEqualTo("b");
        assertThat(result.slots().get(2).entry().expectedValue()).isEqualTo("c");
    }

    @Test
    void itemCountMismatchFailsClosedAsAmbiguous() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "a,b", 4, "1", List.of("a", "b"))));
        stubPage(12, analysis(12, List.of(blank("b1")), List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(result.slots()).hasSize(1);
        var slot = result.slots().get(0);
        assertThat(slot.resolution()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
        assertThat(slot.entry()).isNull();
    }

    @Test
    void interactionsNotConsumedByAnyBlockAreUnmapped() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "a,b", 4, "1", List.of("a", "b"))));
        stubPage(12, analysis(12, List.of(blank("b1"), blank("b2"), blank("b3")), List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots()).hasSize(3);
        assertThat(result.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots().get(1).resolution()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots().get(2).resolution()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.slots().get(2).entry()).isNull();
    }

    @Test
    void entriesResolveByUnitNumberOnlyNotExerciseNumber() {
        stubProfile();
        stubKey(List.of(
            entry(227, "2", "FillBlank", 1, "unit2", 2, "1", List.of("unit2")),
            entry(228, "2", "FillBlank", 1, "unit4", 4, "1", List.of("unit4"))
        ));
        stubPage(12, analysis(12, List.of(blank("b1")), List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.unitNumber()).isEqualTo(4);
        assertThat(result.slots().get(0).entry().expectedValue()).isEqualTo("unit4");
    }

    @Test
    void sourceLoesungenPageNumberIsNotExerciseIdentity() {
        stubProfile();
        stubKey(List.of(entry(228, "1", "FillBlank", 1, "der Hund", 4, "1", List.of("der Hund"))));
        stubPage(12, analysis(12, List.of(blank("b1")), List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.slots()).hasSize(1);
        assertThat(result.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots().get(0).entry().pageNumber()).isEqualTo(228);
    }

    @Test
    void parserKindsMapToFrontendKindStrings() {
        stubProfile();
        stubKey(List.of(
            entry(227, "1", "Choice", 1, "b", 4, "1", List.of("b")),
            entry(228, "2", "ChoiceGrid", 1, "a", 4, "1", List.of("a"))
        ));
        stubPage(12, analysis(12, List.of(),
            List.of(choice("c1")), List.of(grid("g1")), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.slots()).hasSize(2);
        assertThat(result.slots().get(0).interactionKind()).isEqualTo("choice");
        assertThat(result.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots().get(1).interactionKind()).isEqualTo("choice-grid");
        assertThat(result.slots().get(1).resolution()).isEqualTo(PageCorrectionResolution.RESOLVED);
    }

    @Test
    void subExerciseMarkerOrdersBlocks() {
        stubProfile();
        stubKey(List.of(
            entry(227, "1", "FillBlank", 0, "first", 4, "2", List.of("first")),
            entry(228, "1", "FillBlank", 0, "second", 4, "1", List.of("second"))
        ));
        stubPage(12, analysis(12, List.of(blank("b1"), blank("b2")), List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.slots()).hasSize(2);
        assertThat(result.slots().get(0).entry().expectedValue()).isEqualTo("second");
        assertThat(result.slots().get(1).entry().expectedValue()).isEqualTo("first");
    }

    @Test
    void consumptionSkipsInteractionsOnOtherUnitsPages() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "x", 4, "1", List.of())));
        stubPage(12, analysis(12, List.of(blank("b1")), List.of(), List.of(), List.of()));
        stubPage(13, analysis(13, List.of(blank("b2")), List.of(), List.of(), List.of()));

        var result = service.resolve(bookId, 13);

        assertThat(result.slots()).hasSize(1);
        assertThat(result.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.slots().get(0).ordinal()).isZero();
    }

    @Test
    void pageWithoutAnalysisResolvesUnmapped() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "x", 4, "1", List.of())));
        when(bookService.getPage(bookId, 12)).thenReturn(Optional.empty());

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.unitNumber()).isEqualTo(4);
        assertThat(result.slots()).isEmpty();
    }

    @Test
    void unknownBookThrowsNotFound() {
        when(bookService.getBook(bookId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resolve(bookId, 12))
            .isInstanceOf(BookNotFoundException.class);
    }

    @Test
    void pageOutOfRangeThrowsNotFound() {
        stubProfile();

        assertThatThrownBy(() -> service.resolve(bookId, 0))
            .isInstanceOf(PageNotFoundException.class);
        assertThatThrownBy(() -> service.resolve(bookId, 257))
            .isInstanceOf(PageNotFoundException.class);
    }

    @Test
    void ambiguousOnOneKindDoesNotPoisonResolvedKinds() {
        stubProfile();
        stubKey(List.of(
            entry(227, "1", "FillBlank", 1, "x", 4, "1", List.of("x")),
            entry(228, "2", "Choice", 1, "a,b", 4, "1", List.of("a", "b"))
        ));
        stubPage(12, analysis(12, List.of(blank("b1")),
            List.of(choice("c1")), List.of(), List.of()));

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots().get(0).resolution()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots().get(1).interactionKind()).isEqualTo("choice");
        assertThat(result.slots().get(1).resolution()).isEqualTo(PageCorrectionResolution.AMBIGUOUS);
    }

    @Test
    void unresolvedAnalysisJsonIsSkipped() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FillBlank", 1, "x", 4, "1", List.of())));
        when(bookService.getPage(bookId, 12)).thenReturn(Optional.of(
            new com.lexora.book.domain.BookPage(UUID.randomUUID(), bookId, 12,
                800, 600, ProcessingStatus.READY, "{not json", null, null)));

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.UNMAPPED);
        assertThat(result.slots()).isEmpty();
    }

    @Test
    void freeTextKindResolvesWithBlockConsumption() {
        stubProfile();
        stubKey(List.of(entry(227, "1", "FreeText", 1, "model text", 4, "1",
            List.of("model one", "model two"))));
        stubPage(12, analysis(12, List.of(), List.of(), List.of(),
            List.of(
                new PageAnalysis.FreeTextInteraction("f1", "free-text",
                    new PageAnalysis.BBox(0.1, 0.2, 0.3, 0.05), "detector-v1", 0.9,
                    List.of(), List.of()),
                new PageAnalysis.FreeTextInteraction("f2", "free-text",
                    new PageAnalysis.BBox(0.1, 0.3, 0.3, 0.05), "detector-v1", 0.9,
                    List.of(), List.of())
            )));

        var result = service.resolve(bookId, 12);

        assertThat(result.status()).isEqualTo(PageCorrectionResolution.RESOLVED);
        assertThat(result.slots()).hasSize(2);
        assertThat(result.slots().get(0).interactionKind()).isEqualTo("free-text");
        assertThat(result.slots().get(0).entry().expectedValue()).isEqualTo("model one");
        assertThat(result.slots().get(0).entry().itemIndex()).isZero();
        assertThat(result.slots().get(1).entry().expectedValue()).isEqualTo("model two");
        assertThat(result.slots().get(1).entry().itemIndex()).isEqualTo(1);
    }
}
