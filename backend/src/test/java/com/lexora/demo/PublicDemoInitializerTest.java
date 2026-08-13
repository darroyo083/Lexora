package com.lexora.demo;

import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.infrastructure.AnswerKeyRepository;
import com.lexora.documentanalysis.contract.PageAnalysis;
import org.apache.pdfbox.Loader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.nio.file.Files;
import java.nio.file.Path;

import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PublicDemoInitializerTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @TempDir
    Path storage;

    @Test
    void initializesOnlyRealPrecomputedContentAndTheFourPageSyntheticPdf() throws Exception {
        var books = mock(BookRepository.class);
        var answerKeys = mock(AnswerKeyRepository.class);
        when(books.upsert(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(books.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));

        new PublicDemoInitializer(books, answerKeys, storage.toString()).run(null);

        var source = storage.resolve("pdf").resolve(PublicDemoConstants.STORAGE_KEY);
        assertThat(Files.size(source)).isGreaterThan(1_000);
        try (var document = Loader.loadPDF(source.toFile())) {
            assertThat(document.getNumberOfPages()).isEqualTo(4);
        }

        var pageCaptor = ArgumentCaptor.forClass(BookPage.class);
        verify(books, times(4)).savePage(pageCaptor.capture());
        assertThat(pageCaptor.getAllValues())
            .extracting(BookPage::bookId)
            .containsOnly(PublicDemoConstants.BOOK_ID);
        assertThat(pageCaptor.getAllValues())
            .extracting(BookPage::processingStatus)
            .containsOnly(ProcessingStatus.READY);

        var analyses = pageCaptor.getAllValues().stream()
            .map(page -> readAnalysis(page.analysis()))
            .toList();
        assertThat(analyses).extracting(PageAnalysis::pageNumber).containsExactly(1, 2, 3, 4);
        assertThat(analyses).extracting(analysis -> analysis.processor().engine())
            .containsOnly("opencode-go-vision");
        assertThat(analyses).extracting(analysis -> analysis.processor().model())
            .containsOnly("mimo-v2.5");
        assertThat(analyses.getFirst().exerciseBlanks()).hasSize(3);
        assertThat(analyses.getFirst().choiceTargets()).hasSize(2);
        assertThat(analyses.get(1).matchingInteractions()).hasSize(1);
        assertThat(analyses.get(2).sentenceOrderings()).hasSize(2);
        assertThat(analyses.getFirst().freeTextInteractions()).hasSize(1);

        var pageTwo = analyses.get(1);
        assertThat(pageTwo.processor().parameters())
            .containsEntry("geometryNormalization", "lexora-synthetic-source-v1");
        assertThat(pageTwo.exerciseBlanks().getFirst().interactionBbox().y())
            .isGreaterThan(0.8);
        var firstGridRow = pageTwo.choiceGrids().getFirst().rows().getFirst();
        assertThat(firstGridRow.cells())
            .extracting(cell -> cell.interactionBbox().x())
            .containsExactly(0.532258, 0.641129, 0.75);
        assertThat(pageTwo.choiceGrids().getFirst().rows())
            .extracting(row -> row.rowBbox().y())
            .containsExactly(0.27081, 0.309578, 0.348347, 0.387115);
        assertThat(pageTwo.matchingInteractions().getFirst().bbox().y())
            .isBetween(0.52, 0.53);

        var keyCaptor = ArgumentCaptor.forClass(AnswerKey.class);
        verify(answerKeys).save(keyCaptor.capture());
        assertThat(keyCaptor.getValue().bookId()).isEqualTo(PublicDemoConstants.BOOK_ID);
        assertThat(keyCaptor.getValue().entries()).isNotEmpty();
        assertThat(keyCaptor.getValue().entries())
            .extracting(entry -> entry.interactionKind())
            .contains(
                "FillBlank", "Choice", "SentenceOrdering", "Matching", "FreeText"
            );
    }

    private static PageAnalysis readAnalysis(String json) {
        try {
            return JSON.readValue(json, PageAnalysis.class);
        } catch (Exception error) {
            throw new AssertionError("Public demo analysis must match the backend contract", error);
        }
    }
}
