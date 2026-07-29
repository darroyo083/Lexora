package com.lexora.documentanalysis.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
public class DocumentAnalysisClient {

    private static final Logger log = LoggerFactory.getLogger(DocumentAnalysisClient.class);

    private final RestClient restClient;

    public DocumentAnalysisClient(
        @Value("${lexora.ai-service.base-url:http://localhost:8000}")
        String baseUrl
    ) {
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .build();
    }

    public String analyzePage(String bookId, int pageNumber, String imagePath) {
        var request = Map.of(
            "bookId", bookId,
            "pageNumber", pageNumber,
            "imagePath", imagePath
        );

        log.info("requesting page analysis bookId={} page={}", bookId, pageNumber);
        var response = restClient.post()
            .uri("/internal/document-analysis/pages")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(String.class);

        log.info("page analysis received bookId={} page={}", bookId, pageNumber);
        return response;
    }
}
