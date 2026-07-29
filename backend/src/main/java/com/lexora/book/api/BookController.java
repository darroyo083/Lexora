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

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService service;

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
    public List<Book> list() {
        return service.listBooks();
    }

    @GetMapping("/{bookId}")
    public Book get(@PathVariable UUID bookId) {
        return service.getBook(bookId)
            .orElseThrow(() -> new BookNotFoundException(bookId));
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
    public BookPage processPage(@PathVariable UUID bookId, @PathVariable int pageNumber) throws IOException {
        return service.processPage(bookId, pageNumber);
    }
}
