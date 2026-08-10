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
import java.util.Optional;

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
    void initializesOnlySyntheticReadyContentAndAThreePageSourcePdf() throws Exception {
        var books = mock(BookRepository.class);
        var answerKeys = mock(AnswerKeyRepository.class);
        when(books.findById(PublicDemoConstants.BOOK_ID)).thenReturn(Optional.empty());
        when(books.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(books.savePage(any())).thenAnswer(invocation -> invocation.getArgument(0));

        new PublicDemoInitializer(books, answerKeys, storage.toString()).run(null);

        var source = storage.resolve("pdf").resolve(PublicDemoConstants.STORAGE_KEY);
        assertThat(Files.size(source)).isGreaterThan(1_000);
        try (var document = Loader.loadPDF(source.toFile())) {
            assertThat(document.getNumberOfPages()).isEqualTo(3);
        }

        var pageCaptor = ArgumentCaptor.forClass(BookPage.class);
        verify(books, times(3)).savePage(pageCaptor.capture());
        assertThat(pageCaptor.getAllValues())
            .extracting(BookPage::bookId)
            .containsOnly(PublicDemoConstants.BOOK_ID);
        assertThat(pageCaptor.getAllValues())
            .extracting(BookPage::processingStatus)
            .containsOnly(ProcessingStatus.READY);

        var analyses = pageCaptor.getAllValues().stream()
            .map(page -> readAnalysis(page.analysis()))
            .toList();
        assertThat(analyses).extracting(PageAnalysis::pageNumber).containsExactly(1, 2, 3);
        assertThat(analyses.getFirst().exerciseBlanks()).hasSize(1);
        assertThat(analyses.getFirst().choiceTargets()).hasSize(1);
        assertThat(analyses.getFirst().choiceGrids()).hasSize(1);
        assertThat(analyses.getFirst().sentenceOrderings()).hasSize(1);
        assertThat(analyses.getFirst().matchingInteractions()).hasSize(1);
        assertThat(analyses.getFirst().freeTextInteractions()).hasSize(1);

        var keyCaptor = ArgumentCaptor.forClass(AnswerKey.class);
        verify(answerKeys).save(keyCaptor.capture());
        assertThat(keyCaptor.getValue().bookId()).isEqualTo(PublicDemoConstants.BOOK_ID);
        assertThat(keyCaptor.getValue().entries()).hasSize(6);
        assertThat(keyCaptor.getValue().entries())
            .extracting(entry -> entry.interactionKind())
            .containsExactlyInAnyOrder(
                "FillBlank", "Choice", "ChoiceGrid",
                "SentenceOrdering", "Matching", "FreeText"
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
