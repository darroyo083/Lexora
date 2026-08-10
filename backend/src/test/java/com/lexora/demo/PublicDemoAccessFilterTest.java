package com.lexora.demo;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class PublicDemoAccessFilterTest {

    @Test
    void disabledModeLeavesApplicationRoutesUntouched() throws Exception {
        var request = request("POST", "/api/books");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        new PublicDemoAccessFilter(false).doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    @Test
    void publicModeRejectsEveryBookMutationBeforeItReachesAController() throws Exception {
        var request = request(
            "POST",
            "/api/books/" + PublicDemoConstants.BOOK_ID + "/pages/1/process"
        );
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        new PublicDemoAccessFilter(true).doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("PUBLIC_DEMO_READ_ONLY");
        verifyNoInteractions(chain);
    }

    @Test
    void publicModeHidesEveryNonDemoBookResource() throws Exception {
        var request = request("GET", "/api/books/11111111-1111-4111-8111-111111111111/source");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        new PublicDemoAccessFilter(true).doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(404);
        assertThat(response.getContentAsString()).contains("DEMO_BOOK_NOT_FOUND");
        verifyNoInteractions(chain);
    }

    @Test
    void publicModeAllowsReadOnlyAccessToTheCuratedBook() throws Exception {
        var request = request(
            "GET",
            "/api/books/" + PublicDemoConstants.BOOK_ID + "/pages/1"
        );
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        new PublicDemoAccessFilter(true).doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    @Test
    void publicModeDecodesEncodedPathsBeforeAuthorizing() throws Exception {
        var request = request(
            "GET",
            "/api/books%2F" + PublicDemoConstants.BOOK_ID + "/pages/1"
        );
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        new PublicDemoAccessFilter(true).doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    @Test
    void publicModeRejectsEncodedNonDemoBookPath() throws Exception {
        var request = request(
            "GET",
            "/api/books%2F11111111-1111-4111-8111-111111111111/source"
        );
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);

        new PublicDemoAccessFilter(true).doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(404);
        assertThat(response.getContentAsString()).contains("DEMO_BOOK_NOT_FOUND");
        verifyNoInteractions(chain);
    }

    private static MockHttpServletRequest request(String method, String uri) {
        var request = new MockHttpServletRequest(method, uri);
        request.setRequestURI(uri);
        return request;
    }
}
