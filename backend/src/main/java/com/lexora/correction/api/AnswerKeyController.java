package com.lexora.correction.api;

import com.lexora.correction.application.AnswerKeyService;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.shared.error.AnswerKeyNotFoundException;
import com.lexora.shared.error.BookNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/books")
public class AnswerKeyController {

    private final AnswerKeyService answerKeyService;

    public AnswerKeyController(AnswerKeyService answerKeyService) {
        this.answerKeyService = answerKeyService;
    }

    @GetMapping("/{bookId}/answer-key")
    public ResponseEntity<Map<String, Object>> getAnswerKey(@PathVariable UUID bookId) {
        var key = answerKeyService.findAnswerKey(bookId)
            .orElseThrow(() -> new AnswerKeyNotFoundException(bookId));

        return ResponseEntity.ok(Map.of(
            "extractionStatus", key.extractionStatus().name(),
            "extractionMethod", key.extractionMethod(),
            "parserVersion", key.parserVersion(),
            "sourcePageRange", key.sourcePageRange() != null ? key.sourcePageRange() : "",
            "extractedAt", key.extractedAt() != null ? key.extractedAt().toString() : null,
            "entryCount", key.entryCount(),
            "entries", key.entries(),
            "failureReason", key.failureReason() != null ? key.failureReason() : ""
        ));
    }

    @PostMapping("/{bookId}/answer-key/extract")
    public ResponseEntity<Map<String, Object>> extract(
        @PathVariable UUID bookId,
        @RequestParam(defaultValue = "false") boolean refresh) {

        var existing = answerKeyService.findAnswerKey(bookId);

        if (existing.isPresent()) {
            var key = existing.get();
            if (key.extractionStatus() == ExtractionStatus.PENDING && !refresh) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "extractionStatus", "PENDING",
                    "message", "Answer key extraction is already in progress"
                ));
            }
            if (key.extractionStatus() == ExtractionStatus.READY && !refresh) {
                return ResponseEntity.ok(Map.of(
                    "extractionStatus", "READY",
                    "message", "Answer key already extracted. Use ?refresh=true to re-extract.",
                    "entryCount", key.entryCount()
                ));
            }
        }

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
            "extractionStatus", "PENDING",
            "message", "Answer key extraction initiated"
        ));
    }
}
