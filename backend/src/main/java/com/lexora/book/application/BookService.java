package com.lexora.book.application;

import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.book.infrastructure.BookRepository;
import com.lexora.documentanalysis.client.DocumentAnalysisClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class BookService {

    private static final Logger log = LoggerFactory.getLogger(BookService.class);

    private final BookRepository repository;
    private final DocumentAnalysisClient analysisClient;
    private final Path storageBasePath;

    public BookService(BookRepository repository,
                       DocumentAnalysisClient analysisClient,
                       @Value("${lexora.storage.path:storage}") String storagePath) {
        this.repository = repository;
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
        return repository.save(book);
    }

    public Optional<Book> getBook(UUID id) {
        return repository.findById(id);
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
        var book = repository.findById(bookId)
            .orElseThrow(() -> new IllegalArgumentException("Book not found: " + bookId));

        var existing = repository.findPage(bookId, pageNumber);
        if (existing.isPresent() && existing.get().processingStatus() == ProcessingStatus.READY) {
            return existing.get();
        }

        var pdfPath = storageBasePath.resolve("pdf").resolve(book.storageKey());

        var rasterizedPath = rasterizePage(pdfPath, pageNumber);

        var page = BookPage.create(bookId, pageNumber, 0, 0);
        page = repository.savePage(page);

        repository.savePage(new BookPage(
            page.id(), page.bookId(), page.pageNumber(),
            page.width(), page.height(),
            ProcessingStatus.PROCESSING, null, null, null
        ));

        try {
            var analysisJson = analysisClient.analyzePage(
                bookId.toString(), pageNumber, rasterizedPath.toString()
            );
            log.info("page analyzed bookId={} page={}", bookId, pageNumber);
            return repository.savePage(page.markReady(analysisJson));
        } catch (Exception e) {
            log.error("page analysis failed bookId={} page={}", bookId, pageNumber, e);
            return repository.savePage(page.markFailed(e.getMessage()));
        }
    }

    private Path rasterizePage(Path pdfPath, int pageNumber) throws IOException {
        var outputPath = storageBasePath.resolve("pdf").resolve(
            pdfPath.getFileName().toString().replace(
                ".pdf", "-page" + pageNumber + "-300dpi.png"
            )
        );
        if (Files.exists(outputPath)) {
            return outputPath;
        }

        try (var document = org.apache.pdfbox.Loader.loadPDF(pdfPath.toFile())) {
            var renderer = new org.apache.pdfbox.rendering.PDFRenderer(document);
            var bufferedImage = renderer.renderImageWithDPI(pageNumber - 1, 300);

            javax.imageio.ImageIO.write(bufferedImage, "PNG", outputPath.toFile());
        }

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
