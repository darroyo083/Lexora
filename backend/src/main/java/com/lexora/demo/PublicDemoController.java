package com.lexora.demo;

import com.lexora.book.application.BookService;
import com.lexora.shared.error.BookNotFoundException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/public-demo")
@ConditionalOnProperty(name = "lexora.public-demo.enabled", havingValue = "true")
public class PublicDemoController {

    private final BookService books;

    public PublicDemoController(BookService books) {
        this.books = books;
    }

    @GetMapping
    public Map<String, Object> demo() {
        var book = books.getBook(PublicDemoConstants.BOOK_ID)
            .orElseThrow(() -> new BookNotFoundException(PublicDemoConstants.BOOK_ID));
        return Map.of(
            "mode", "curated-read-only",
            "bookId", book.id(),
            "title", book.title(),
            "pageCount", book.pageCount(),
            "analysisTriggering", false
        );
    }
}
