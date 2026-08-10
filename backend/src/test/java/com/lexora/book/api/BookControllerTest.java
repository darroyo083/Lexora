package com.lexora.book.api;

import com.lexora.book.application.BookService;
import com.lexora.book.domain.Book;
import com.lexora.book.domain.ProcessingStatus;
import com.lexora.demo.PublicDemoConstants;
import com.lexora.shared.error.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;
import java.time.Instant;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

class BookControllerTest {

    private MockMvc mvc;
    private BookService bookService;

    @BeforeEach
    void setUp() {
        bookService = mock(BookService.class);
        mvc = MockMvcBuilders
            .standaloneSetup(new BookController(bookService))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void listBooksReturnsOk() throws Exception {
        when(bookService.listBooks()).thenReturn(List.of());

        mvc.perform(get("/api/books"))
            .andExpect(status().isOk());
    }

    @Test
    void getBookOmitsStorageAndFingerprintMetadata() throws Exception {
        var id = UUID.randomUUID();
        when(bookService.getBook(id)).thenReturn(java.util.Optional.of(new Book(
            id,
            "Public title",
            "private-filename.pdf",
            "application/pdf",
            42,
            "private-checksum",
            3,
            "de",
            "private-storage-key.pdf",
            ProcessingStatus.READY,
            Instant.EPOCH,
            Instant.EPOCH
        )));

        mvc.perform(get("/api/books/{bookId}", id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Public title"))
            .andExpect(jsonPath("$.originalFilename").doesNotExist())
            .andExpect(jsonPath("$.checksum").doesNotExist())
            .andExpect(jsonPath("$.storageKey").doesNotExist());
    }

    @Test
    void publicDemoListContainsOnlyTheCuratedBook() throws Exception {
        var demo = book(PublicDemoConstants.BOOK_ID, "Lexora Public Demo");
        var nonDemoBook = book(UUID.randomUUID(), "Non-demo book");
        when(bookService.listBooks()).thenReturn(List.of(nonDemoBook, demo));
        ReflectionTestUtils.setField(
            mvc.getDispatcherServlet().getWebApplicationContext()
                .getBean(BookController.class),
            "publicDemoEnabled",
            true
        );

        mvc.perform(get("/api/books"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(PublicDemoConstants.BOOK_ID.toString()));
    }

    @Test
    void processPageDefaultsRefreshToFalse() throws Exception {
        var bookId = UUID.randomUUID();

        mvc.perform(post("/api/books/{bookId}/pages/1/process", bookId))
            .andExpect(status().isOk());

        verify(bookService).processPage(bookId, 1, false);
    }

    @Test
    void processPageAcceptsExplicitRefresh() throws Exception {
        var bookId = UUID.randomUUID();

        mvc.perform(post("/api/books/{bookId}/pages/1/process", bookId)
                .queryParam("refreshAnalysis", "true"))
            .andExpect(status().isOk());

        verify(bookService).processPage(bookId, 1, true);
    }

    private static Book book(UUID id, String title) {
        return new Book(
            id, title, title + ".pdf", "application/pdf", 42, "checksum",
            3, "de", title + ".pdf", ProcessingStatus.READY, Instant.EPOCH, Instant.EPOCH
        );
    }
}
