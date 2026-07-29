package com.lexora.book.api;

import com.lexora.book.application.BookService;
import com.lexora.shared.error.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
}
