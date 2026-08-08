package com.lexora.correction.application;

import com.lexora.book.domain.Book;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.correction.infrastructure.AnswerKeyRepository;
import com.lexora.shared.error.AnswerKeyNotFoundException;
import com.lexora.shared.error.BookNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class AnswerKeyService {

    private static final Logger log = LoggerFactory.getLogger(AnswerKeyService.class);

    private final AnswerKeyRepository answerKeyRepository;
    private final BookRepository bookRepository;

    public AnswerKeyService(AnswerKeyRepository answerKeyRepository,
                            BookRepository bookRepository) {
        this.answerKeyRepository = answerKeyRepository;
        this.bookRepository = bookRepository;
    }

    public AnswerKey getAnswerKey(UUID bookId) {
        return answerKeyRepository.findByBookId(bookId)
            .orElseThrow(() -> new AnswerKeyNotFoundException(bookId));
    }

    public Optional<AnswerKey> findAnswerKey(UUID bookId) {
        return answerKeyRepository.findByBookId(bookId);
    }

    public AnswerKey extractAnswerKey(UUID bookId, String extractionMethod,
                                       String parserVersion, String sourcePageRange,
                                       List<AnswerKeyEntry> entries) {
        bookRepository.findById(bookId)
            .orElseThrow(() -> new BookNotFoundException(bookId));

        var now = Instant.now();
        var key = new AnswerKey(
            bookId,
            extractionMethod,
            parserVersion,
            sourcePageRange,
            ExtractionStatus.READY,
            null,
            now,
            entries,
            now,
            now
        );

        answerKeyRepository.save(key);
        log.info("answer key extracted bookId={} method={} entries={}",
            bookId, extractionMethod, entries.size());
        return key;
    }

    public AnswerKey extractAnswerKeyRefresh(UUID bookId, String extractionMethod,
                                              String parserVersion, String sourcePageRange,
                                              List<AnswerKeyEntry> entries) {
        bookRepository.findById(bookId)
            .orElseThrow(() -> new BookNotFoundException(bookId));

        var existing = answerKeyRepository.findByBookId(bookId);

        try {
            var now = Instant.now();
            var key = new AnswerKey(
                bookId,
                extractionMethod,
                parserVersion,
                sourcePageRange,
                ExtractionStatus.READY,
                null,
                now,
                entries,
                now,
                now
            );
            answerKeyRepository.save(key);
            log.info("answer key refreshed bookId={} method={} entries={}",
                bookId, extractionMethod, entries.size());
            return key;
        } catch (Exception e) {
            log.error("answer key refresh failed bookId={}", bookId, e);
            if (existing.isPresent()) {
                log.info("retaining previous answer key after failed refresh bookId={}", bookId);
                return existing.get();
            }
            var failedKey = new AnswerKey(
                bookId,
                extractionMethod,
                parserVersion,
                sourcePageRange,
                ExtractionStatus.FAILED,
                e.getMessage(),
                null,
                existing.map(AnswerKey::entries).orElse(List.of()),
                Instant.now(),
                Instant.now()
            );
            answerKeyRepository.save(failedKey);
            throw new RuntimeException("Answer key extraction failed and no previous key exists", e);
        }
    }
}
