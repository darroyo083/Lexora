package com.lexora.demo;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.ExtractionStatus;
import com.lexora.correction.infrastructure.AnswerKeyRepository;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
        writeSourcePdf(source);

        if (books.findById(PublicDemoConstants.BOOK_ID).isEmpty()) {
            books.save(new Book(
                PublicDemoConstants.BOOK_ID,
                "Lexora Public Demo",
                "lexora-public-demo.pdf",
                "application/pdf",
                Files.size(source),
                sha256(source),
                3,
                "de",
                PublicDemoConstants.STORAGE_KEY,
                ProcessingStatus.UPLOADED,
                CREATED_AT,
                CREATED_AT,
                PublicDemoConstants.PROFILE_ID
            ));
        }

        for (int pageNumber = 1; pageNumber <= 3; pageNumber++) {
            var analysis = readResource("demo/page-analysis-" + pageNumber + ".json");
            books.savePage(new BookPage(
                java.util.UUID.nameUUIDFromBytes(
                    ("lexora-demo-page-" + pageNumber).getBytes(java.nio.charset.StandardCharsets.UTF_8)
                ),
                PublicDemoConstants.BOOK_ID,
                pageNumber,
                1224,
                1584,
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

    static void writeSourcePdf(Path target) throws IOException {
        try (var document = new PDDocument()) {
            addPage(document, "A deliberate daily practice", List.of(
                "Small routines make language practice easier to repeat.",
                "1. Complete: Jeden Morgen ___ ich Deutsch.",
                "2. Choose the greeting used in the morning.",
                "   Guten Morgen    Gute Nacht",
                "3. Choose the article for Kaffee: der / die / das",
                "4. Put in order: Ich / lerne / jeden / Tag",
                "5. Match: lernen = study, Buch = book",
                "6. Write one sentence about your study routine."
            ));
            addPage(document, "Why repetition works", List.of(
                "A short routine lowers the effort needed to begin.",
                "The same cue helps practice become familiar instead of accidental.",
                "Keep the task small, check the result, and return tomorrow.",
                "Consistency gives each new word another useful context.",
                "Example: Jeden Morgen lerne ich zehn Minuten Deutsch."
            ));
            addPage(document, "A source-first fallback", List.of(
                "Some pages should stay in their original form.",
                "When structure is uncertain, Lexora does not invent an exercise.",
                "Classic Mode keeps the public-safe source page available."
            ));
            document.save(target.toFile());
        }
    }

    private static void addPage(PDDocument document, String title, List<String> lines)
        throws IOException {
        var page = new PDPage(PDRectangle.A4);
        document.addPage(page);
        try (var content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 20);
            content.newLineAtOffset(58, 770);
            content.showText(title);
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setLeading(34);
            for (var line : lines) {
                content.newLine();
                content.showText(line);
            }
            content.endText();
        }
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
