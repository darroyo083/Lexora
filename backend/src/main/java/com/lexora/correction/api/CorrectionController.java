package com.lexora.correction.api;

import com.lexora.correction.application.CorrectionResolutionService;
import com.lexora.correction.domain.PageCorrectionResolution;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/books")
public class CorrectionController {

    private final CorrectionResolutionService resolutionService;

    public CorrectionController(CorrectionResolutionService resolutionService) {
        this.resolutionService = resolutionService;
    }

    @GetMapping("/{bookId}/pages/{pageNumber}/correction")
    public PageCorrectionResolution correction(@PathVariable UUID bookId,
                                               @PathVariable int pageNumber) {
        return resolutionService.resolve(bookId, pageNumber);
    }
}
