package com.lexora.book.api;

import com.lexora.book.application.BookService;
import com.lexora.book.domain.Book;
import com.lexora.book.domain.BookPage;
import com.lexora.shared.error.BookNotFoundException;
import com.lexora.shared.error.PageNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.FileSystemResource;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.beans.factory.annotation.Value;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService service;

    @Value("${lexora.public-demo.enabled:false}")
    private boolean publicDemoEnabled;

    public BookController(BookService service) {
        this.service = service;
    }

    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> upload(
        @RequestParam("file") MultipartFile file,
        @RequestParam(value = "language", defaultValue = "de") String language
    ) throws IOException {
        var book = service.uploadBook(file, language);
        return Map.of(
            "id", book.id(),
            "pageCount", book.pageCount(),
            "status", book.status().name()
        );
    }

    @GetMapping
    public List<BookResource> list() {
        return service.listBooks().stream()
            .filter(book -> !publicDemoEnabled
                || book.id().equals(com.lexora.demo.PublicDemoConstants.BOOK_ID))
            .map(BookResource::from)
            .toList();
    }

    @GetMapping("/{bookId}")
    public BookResource get(@PathVariable UUID bookId) {
        return BookResource.from(service.getBook(bookId)
            .orElseThrow(() -> new BookNotFoundException(bookId)));
    }

    @GetMapping(value = "/{bookId}/source", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<FileSystemResource> source(@PathVariable UUID bookId) throws IOException {
        var source = new FileSystemResource(service.getBookSource(bookId));
        return ResponseEntity.ok()
            .contentLength(source.contentLength())
            .body(source);
    }

    @GetMapping("/{bookId}/pages")
    public List<BookPage> pages(@PathVariable UUID bookId) {
        return service.getPages(bookId);
    }

    @GetMapping("/{bookId}/pages/{pageNumber}")
    public BookPage page(@PathVariable UUID bookId, @PathVariable int pageNumber) {
        return service.getPage(bookId, pageNumber)
            .orElseThrow(() -> new PageNotFoundException(bookId, pageNumber));
    }

    @PostMapping("/{bookId}/pages/{pageNumber}/process")
    public BookPage processPage(
        @PathVariable UUID bookId,
        @PathVariable int pageNumber,
        @RequestParam(defaultValue = "false") boolean refreshAnalysis
    ) throws IOException {
        return service.processPage(bookId, pageNumber, refreshAnalysis);
    }

    public record BookResource(
        UUID id,
        String title,
        int pageCount,
        String sourceLanguage,
        String status
    ) {
        static BookResource from(Book book) {
            return new BookResource(
                book.id(), book.title(), book.pageCount(),
                book.sourceLanguage(), book.status().name()
            );
        }
    }
}
