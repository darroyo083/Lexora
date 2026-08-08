package com.lexora.correction.api;

import com.lexora.correction.application.AnswerKeyService;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.shared.error.AnswerKeyNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
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

        var body = new LinkedHashMap<String, Object>();
        body.put("extractionStatus", key.extractionStatus().name());
        body.put("extractionMethod", key.extractionMethod());
        body.put("parserVersion", key.parserVersion());
        body.put("sourcePageRange", key.sourcePageRange() != null ? key.sourcePageRange() : "");
        if (key.extractedAt() != null) {
            body.put("extractedAt", key.extractedAt().toString());
        }
        body.put("entryCount", key.entryCount());
        body.put("entries", key.entries());
        body.put("failureReason", key.failureReason() != null ? key.failureReason() : "");
        return ResponseEntity.ok(body);
    }

    @PostMapping("/{bookId}/answer-key/extract")
    public ResponseEntity<Map<String, Object>> extract(
        @PathVariable UUID bookId,
        @RequestParam(defaultValue = "false") boolean refresh) {

        var existing = answerKeyService.findAnswerKey(bookId);

        if (existing.isPresent()) {
            var key = existing.get();
            if (key.extractionStatus() == ExtractionStatus.PENDING && !refresh) {
                var body = new LinkedHashMap<String, Object>();
                body.put("extractionStatus", "PENDING");
                body.put("message", "Answer key extraction is already in progress");
                return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
            }
            if (key.extractionStatus() == ExtractionStatus.READY && !refresh) {
                var body = new LinkedHashMap<String, Object>();
                body.put("extractionStatus", "READY");
                body.put("message", "Answer key already extracted. Use ?refresh=true to re-extract.");
                body.put("entryCount", key.entryCount());
                return ResponseEntity.ok(body);
            }
        }

        var body = new LinkedHashMap<String, Object>();
        body.put("extractionStatus", "PENDING");
        body.put("message", "Answer key extraction initiated");
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
    }
}
