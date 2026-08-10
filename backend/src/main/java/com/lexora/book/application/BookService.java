package com.lexora.book.application;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookProfileRepository;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.documentanalysis.client.DocumentAnalysisClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import tools.jackson.databind.json.JsonMapper;

@Service
public class BookService {

    private static final Logger log = LoggerFactory.getLogger(BookService.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    /**
     * Deterministic book checksum -> BookProfile edition association. Only the
     * known private workbook is mapped; unknown books stay profile-less and
     * correct as UNMAPPED (fail-closed).
     */
    static final String GRAMMATIK_AKTIV_A1_B1_CHECKSUM =
        "0d54de09b60a1e1879edfdb4eeaaab120bbf1d76686622140c9a6c2fef31abec";
    static final String GRAMMATIK_AKTIV_A1_B1_EDITION_KEY =
        "grammatik-aktiv-a1-b1-aktualisiert";

    private static final Map<String, String> CHECKSUM_TO_EDITION_KEY = Map.of(
        GRAMMATIK_AKTIV_A1_B1_CHECKSUM, GRAMMATIK_AKTIV_A1_B1_EDITION_KEY
    );

    private final BookRepository repository;
    private final BookProfileRepository bookProfileRepository;
    private final DocumentAnalysisClient analysisClient;
    private final Path storageBasePath;

    @Value("${lexora.analysis.raster-dpi:300}")
    private int rasterDpi = 300;

    public BookService(BookRepository repository,
                       BookProfileRepository bookProfileRepository,
                       DocumentAnalysisClient analysisClient,
                       @Value("${lexora.storage.path:storage}") String storagePath) {
        this.repository = repository;
        this.bookProfileRepository = bookProfileRepository;
        this.analysisClient = analysisClient;
        this.storageBasePath = Path.of(storagePath).toAbsolutePath().normalize();
        try {
            Files.createDirectories(storageBasePath.resolve("pdf"));
        } catch (IOException e) {
            throw new RuntimeException("Cannot create storage directory", e);
        }
    }

    public Book uploadBook(MultipartFile file, String sourceLanguage) throws IOException {
        validatePdf(file);

        var storageKey = UUID.randomUUID().toString() + ".pdf";
        var targetPath = storageBasePath.resolve("pdf").resolve(storageKey);
        file.transferTo(targetPath);

        var checksum = sha256(targetPath);
        var pageCount = getPageCount(targetPath);

        var book = Book.create(
            extractTitle(file.getOriginalFilename()),
            file.getOriginalFilename(),
            file.getContentType(),
            file.getSize(),
            checksum,
            pageCount,
            sourceLanguage,
            storageKey
        );

        log.info("book created id={} pages={}", book.id(), pageCount);
        return repository.save(attachProfile(book));
    }

    public Optional<Book> getBook(UUID id) {
        var book = repository.findById(id).orElse(null);
        if (book == null) {
            return Optional.empty();
        }
        return Optional.of(attachProfileIfKnown(book));
    }

    public List<Book> listBooks() {
        return repository.findAll();
    }

    public Optional<BookPage> getPage(UUID bookId, int pageNumber) {
        return repository.findPage(bookId, pageNumber);
    }

    public List<BookPage> getPages(UUID bookId) {
        return repository.findPagesByBookId(bookId);
    }

    public Path getBookSource(UUID bookId) {
        var book = repository.findById(bookId)
            .orElseThrow(() -> new IllegalArgumentException("Book not found: " + bookId));
        return storageBasePath.resolve("pdf").resolve(book.storageKey());
    }

    public BookPage processPage(UUID bookId, int pageNumber) throws IOException {
        return processPage(bookId, pageNumber, false);
    }

    public BookPage processPage(UUID bookId, int pageNumber, boolean refreshAnalysis) throws IOException {
        var book = repository.findById(bookId)
            .orElseThrow(() -> new IllegalArgumentException("Book not found: " + bookId));

        if (pageNumber < 1 || pageNumber > book.pageCount()) {
            throw new IllegalArgumentException("Page out of range: " + pageNumber);
        }

        var claimed = repository.startPageProcessing(bookId, pageNumber, refreshAnalysis);
        if (claimed.isEmpty()) {
            return repository.findPage(bookId, pageNumber).orElseThrow();
        }
        var page = claimed.get();

        try {
            page = repository.savePage(page.transitionTo(ProcessingStatus.RASTERIZING));
            var pdfPath = storageBasePath.resolve("pdf").resolve(book.storageKey());
            var rasterizedPath = rasterizePage(pdfPath, pageNumber);

            page = repository.savePage(page.transitionTo(ProcessingStatus.OCR));
            var analysis = analysisClient.analyzePage(
                bookId.toString(), pageNumber, rasterizedPath.toString()
            );
            page = repository.savePage(page.transitionTo(ProcessingStatus.DETECTING_INTERACTIONS));
            var finalAnalysis = analysisClient.detectInteractions(
                rasterizedPath.toString(), analysis
            );
            log.info("page analyzed bookId={} page={}", bookId, pageNumber);
            page = repository.savePage(page.transitionTo(ProcessingStatus.PERSISTING));
            return repository.savePage(page.markReady(JSON.writeValueAsString(finalAnalysis)));
        } catch (Exception e) {
            log.error("page analysis failed bookId={} page={}", bookId, pageNumber, e);
            return repository.savePage(page.markFailed(e.getMessage()));
        }
    }

    public List<Path> rasterizePages(Path pdfPath, int fromPage, int toPage) throws IOException {
        if (fromPage < 1 || toPage < fromPage) {
            throw new IllegalArgumentException("Invalid page range: " + fromPage + "-" + toPage);
        }

        var output = new java.util.ArrayList<Path>(toPage - fromPage + 1);
        try (var document = org.apache.pdfbox.Loader.loadPDF(pdfPath.toFile())) {
            if (toPage > document.getNumberOfPages()) {
                throw new IllegalArgumentException("Page out of range: " + toPage);
            }
            var renderer = new org.apache.pdfbox.rendering.PDFRenderer(document);
            for (int pageNumber = fromPage; pageNumber <= toPage; pageNumber++) {
                output.add(rasterizePage(renderer, pdfPath, pageNumber));
            }
        }
        return List.copyOf(output);
    }

    private Path rasterizePage(Path pdfPath, int pageNumber) throws IOException {
        var outputPath = rasterOutputPath(pdfPath, pageNumber);
        if (Files.exists(outputPath)) {
            return outputPath;
        }
        try (var document = org.apache.pdfbox.Loader.loadPDF(pdfPath.toFile())) {
            return renderPage(
                new org.apache.pdfbox.rendering.PDFRenderer(document),
                pdfPath, pageNumber, outputPath
            );
        }
    }

    private Path rasterizePage(org.apache.pdfbox.rendering.PDFRenderer renderer,
                               Path pdfPath, int pageNumber) throws IOException {
        var outputPath = rasterOutputPath(pdfPath, pageNumber);
        if (Files.exists(outputPath)) {
            return outputPath;
        }
        return renderPage(renderer, pdfPath, pageNumber, outputPath);
    }

    private Path rasterOutputPath(Path pdfPath, int pageNumber) {
        return Path.of(
            pdfPath.getParent().toString(),
            pdfPath.getFileName().toString().replace(
                ".pdf", "-page" + pageNumber + "-" + rasterDpi + "dpi.png"
            )
        );
    }

    private Path renderPage(org.apache.pdfbox.rendering.PDFRenderer renderer,
                            Path pdfPath, int pageNumber, Path outputPath) throws IOException {
        if (rasterDpi < 96 || rasterDpi > 300) {
            throw new IllegalStateException("Raster DPI must be between 96 and 300");
        }
        var bufferedImage = renderer.renderImageWithDPI(pageNumber - 1, rasterDpi);
        javax.imageio.ImageIO.write(bufferedImage, "PNG", outputPath.toFile());
        return outputPath;
    }

    private static void validatePdf(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("File is empty");
        }
        var mime = file.getContentType();
        if (mime == null || !mime.equals("application/pdf")) {
            throw new IllegalArgumentException("Only PDF files are accepted, got: " + mime);
        }
        var name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".pdf")) {
            throw new IllegalArgumentException("File must have .pdf extension");
        }
        if (file.getSize() > 200 * 1024 * 1024) {
            throw new IllegalArgumentException("File too large (max 200 MB)");
        }
    }

    private Book attachProfile(Book book) {
        var profileId = resolveProfileId(book.checksum());
        return profileId.isPresent() ? book.withBookProfileId(profileId.get()) : book;
    }

    /**
     * Lazy fallback for books uploaded before profiles existed: attach the
     * profile when the stored checksum matches a known edition.
     */
    private Book attachProfileIfKnown(Book book) {
        if (book.bookProfileId() != null) {
            return book;
        }
        var profileId = resolveProfileId(book.checksum());
        if (profileId.isEmpty()) {
            return book;
        }
        repository.attachBookProfile(book.id(), profileId.get());
        log.info("book profile attached lazily bookId={} profileId={}", book.id(), profileId.get());
        return book.withBookProfileId(profileId.get());
    }

    private Optional<UUID> resolveProfileId(String checksum) {
        if (checksum == null) {
            return Optional.empty();
        }
        var editionKey = CHECKSUM_TO_EDITION_KEY.get(checksum.toLowerCase());
        if (editionKey == null) {
            return Optional.empty();
        }
        return bookProfileRepository.findByEditionKey(editionKey).map(BookProfile::id);
    }

    private static String extractTitle(String filename) {
        if (filename == null) return "Untitled";
        var dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    private static String sha256(Path path) throws IOException {
        try {
            var md = MessageDigest.getInstance("SHA-256");
            md.update(Files.readAllBytes(path));
            return HexFormat.of().formatHex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    private static int getPageCount(Path pdfPath) throws IOException {
        try (var document = org.apache.pdfbox.Loader.loadPDF(pdfPath.toFile())) {
            return document.getNumberOfPages();
        }
    }
}
