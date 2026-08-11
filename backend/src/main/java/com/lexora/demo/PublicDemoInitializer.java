package com.lexora.demo;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.correction.infrastructure.AnswerKeyRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(name = "lexora.public-demo.enabled", havingValue = "true")
public class PublicDemoInitializer implements ApplicationRunner {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Instant CREATED_AT = Instant.parse("2026-08-10T12:00:00Z");

    private final BookRepository books;
    private final AnswerKeyRepository answerKeys;
    private final Path storagePath;

    public PublicDemoInitializer(
        BookRepository books,
        AnswerKeyRepository answerKeys,
        @Value("${lexora.storage.path:storage}") String storagePath
    ) {
        this.books = books;
        this.answerKeys = answerKeys;
        this.storagePath = Path.of(storagePath).toAbsolutePath().normalize();
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        var pdfDirectory = storagePath.resolve("pdf");
        Files.createDirectories(pdfDirectory);
        var source = pdfDirectory.resolve(PublicDemoConstants.STORAGE_KEY);
        copySourcePdf(source);
        if (!sha256(source).equals(PublicDemoConstants.SOURCE_SHA256)) {
            throw new IllegalStateException("Public demo PDF does not match its provenance hash");
        }

        books.upsert(new Book(
            PublicDemoConstants.BOOK_ID,
            "Lexora Synthetic German Workbook",
            "lexora-synthetic-workbook.pdf",
            "application/pdf",
            Files.size(source),
            sha256(source),
            PublicDemoConstants.PAGE_COUNT,
            "de",
            PublicDemoConstants.STORAGE_KEY,
            ProcessingStatus.UPLOADED,
            CREATED_AT,
            CREATED_AT,
            PublicDemoConstants.PROFILE_ID
        ));

        for (int pageNumber = 1; pageNumber <= PublicDemoConstants.PAGE_COUNT; pageNumber++) {
            var analysis = readResource("demo/page-analysis-" + pageNumber + ".json");
            var validated = validateAnalysis(analysis, pageNumber);
            books.savePage(new BookPage(
                java.util.UUID.nameUUIDFromBytes(
                    ("lexora-demo-page-" + pageNumber).getBytes(java.nio.charset.StandardCharsets.UTF_8)
                ),
                PublicDemoConstants.BOOK_ID,
                pageNumber,
                validated.width(),
                validated.height(),
                ProcessingStatus.READY,
                analysis,
                CREATED_AT,
                null
            ));
        }

        var entries = JSON.readValue(
            readResource("demo/answer-key.json"),
            new TypeReference<List<AnswerKeyEntry>>() {}
        );
        answerKeys.save(new AnswerKey(
            PublicDemoConstants.BOOK_ID,
            "curated-public-demo",
            "1.0.0",
            "synthetic",
            ExtractionStatus.READY,
            null,
            CREATED_AT,
            entries,
            CREATED_AT,
            CREATED_AT
        ));
    }

    static void copySourcePdf(Path target) throws IOException {
        try (var input = new ClassPathResource(
            "demo/lexora-synthetic-workbook.pdf"
        ).getInputStream()) {
            Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static com.lexora.documentanalysis.contract.PageAnalysis validateAnalysis(
        String analysis,
        int pageNumber
    ) {
        var parsed = JSON.readValue(
            analysis,
            com.lexora.documentanalysis.contract.PageAnalysis.class
        );
        if (!PublicDemoConstants.ANALYSIS_SCHEMA_VERSION.equals(parsed.schemaVersion())
            || parsed.pageNumber() != pageNumber
            || parsed.processor() == null
            || !"opencode-go-vision".equals(parsed.processor().engine())
            || !"mimo-v2.5".equals(parsed.processor().model())) {
            throw new IllegalStateException(
                "Public demo analysis failed real-provider provenance validation for page "
                    + pageNumber
            );
        }
        return parsed;
    }

    private static String readResource(String name) throws IOException {
        try (var input = new ClassPathResource(name).getInputStream()) {
            return new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    private static String sha256(Path path) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        digest.update(Files.readAllBytes(path));
        return HexFormat.of().formatHex(digest.digest());
    }
}
