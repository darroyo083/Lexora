package com.lexora.correction.application;

import com.lexora.book.application.BookService;
import com.lexora.book.infrastructure.BookProfileRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.documentanalysis.client.DocumentAnalysisClient;
import com.lexora.documentanalysis.contract.ExtractAnswerKeyResponse;
import com.lexora.shared.error.BookNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

@Service
public class AnswerKeyExtractionService {

    public static final String PUBLISHER = "cornelsen";
    private static final String UNKNOWN_PARSER_VERSION = "unknown";

    private static final Logger log = LoggerFactory.getLogger(AnswerKeyExtractionService.class);

    private final BookService bookService;
    private final DocumentAnalysisClient analysisClient;
    private final AnswerKeyService answerKeyService;
    private final BookProfileRepository bookProfileRepository;
    private final int answerKeyPageRange;

    public AnswerKeyExtractionService(BookService bookService,
                                      DocumentAnalysisClient analysisClient,
                                      AnswerKeyService answerKeyService,
                                      BookProfileRepository bookProfileRepository,
                                      @Value("${lexora.answer-key.page-range:30}") int answerKeyPageRange) {
        this.bookService = bookService;
        this.analysisClient = analysisClient;
        this.answerKeyService = answerKeyService;
        this.bookProfileRepository = bookProfileRepository;
        this.answerKeyPageRange = answerKeyPageRange;
    }

    public AnswerKey extract(UUID bookId, boolean refresh) {
        var book = bookService.getBook(bookId)
            .orElseThrow(() -> new BookNotFoundException(bookId));

        var range = resolveExtractionRange(book);
        var pdfPath = bookService.getBookSource(bookId);

        List<Path> rasters;
        try {
            rasters = bookService.rasterizePages(pdfPath, range.from(), range.to());
        } catch (Exception e) {
            throw extractionFailure(bookId, refresh, range.toString(), e);
        }

        ExtractAnswerKeyResponse response;
        try {
            response = analysisClient.extractAnswerKey(bookId.toString(), rasters, PUBLISHER);
        } catch (Exception e) {
            throw extractionFailure(bookId, refresh, range.toString(), e);
        }

        if (response.entries().isEmpty()) {
            throw extractionFailure(bookId, refresh, range.toString(),
                new RuntimeException("AI service returned no answer key entries"));
        }

        var extractionMethod = response.extractionMethod() != null
            ? response.extractionMethod() : PUBLISHER;
        var parserVersion = response.parserVersion() != null
            ? response.parserVersion() : UNKNOWN_PARSER_VERSION;

        try {
            if (refresh) {
                return answerKeyService.extractAnswerKeyRefresh(
                    bookId, extractionMethod, parserVersion, range.toString(), response.entries());
            }
            return answerKeyService.extractAnswerKey(
                bookId, extractionMethod, parserVersion, range.toString(), response.entries());
        } catch (Exception e) {
            throw extractionFailure(bookId, refresh, range.toString(), e);
        }
    }

    private AnswerKeyExtractionException extractionFailure(UUID bookId, boolean refresh,
                                                           String sourcePageRange, Exception cause) {
        log.error("answer key extraction failed bookId={}", bookId, cause);
        var message = cause.getMessage() != null
            ? cause.getMessage() : cause.getClass().getSimpleName();
        var previous = answerKeyService.findAnswerKey(bookId);
        if (refresh && previous.isPresent()
            && previous.get().extractionStatus() == ExtractionStatus.READY) {
            log.info("retaining previous answer key after failed refresh bookId={}", bookId);
            return new AnswerKeyExtractionException(message, cause);
        }
        answerKeyService.markFailed(
            bookId, PUBLISHER, UNKNOWN_PARSER_VERSION, sourcePageRange, message);
        return new AnswerKeyExtractionException(message, cause);
    }

    /**
     * Books with a BookProfile rasterize the profile's Lösungen range
     * (authoritative); profile-less books keep the legacy "last N pages"
     * heuristic as the fallback.
     */
    private PageRange resolveExtractionRange(com.lexora.book.domain.Book book) {
        if (book.bookProfileId() != null) {
            var profile = bookProfileRepository.findById(book.bookProfileId()).orElse(null);
            if (profile != null) {
                return new PageRange(
                    profile.loesungenPdfRange().from(),
                    profile.loesungenPdfRange().to()
                );
            }
        }
        return resolvePageRange(book.pageCount(), answerKeyPageRange);
    }

    static PageRange resolvePageRange(int pageCount, int pageRange) {
        var to = Math.max(1, pageCount);
        var from = Math.max(1, to - pageRange + 1);
        return new PageRange(from, to);
    }

    record PageRange(int from, int to) {
        @Override
        public String toString() {
            return from + "-" + to;
        }
    }
}
