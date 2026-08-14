package com.lexora.assist.api;

import com.lexora.assist.application.AnonymousSessionService;
import com.lexora.assist.application.AssistConfiguration;
import com.lexora.assist.application.AssistService;
import com.lexora.assist.contract.AssistContract.AssistConfig;
import com.lexora.assist.contract.AssistContract.AssistResponse;
import com.lexora.shared.error.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AssistControllerTest {

    private MockMvc mvc;
    private AssistService service;
    private AnonymousSessionService sessionService;
    private AssistConfiguration configuration;

    @BeforeEach
    void setUp() {
        service = mock(AssistService.class);
        sessionService = mock(AnonymousSessionService.class);
        configuration = mock(AssistConfiguration.class);
        when(configuration.production()).thenReturn(false);
        mvc = MockMvcBuilders
            .standaloneSetup(new AssistController(service, sessionService, configuration))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void configReturnsSafePublicConfig() throws Exception {
        when(service.config()).thenReturn(new AssistConfig(true, "public-site-key"));

        mvc.perform(get("/api/ai/assist/config"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true))
            .andExpect(jsonPath("$.siteKey").value("public-site-key"));
    }

    @Test
    void assistSetsHttpOnlySessionCookie() throws Exception {
        when(sessionService.newSessionId()).thenReturn("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
        when(service.assist(any(), eq("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"), any()))
            .thenReturn(AssistResponse.success("hint", "A hint", null, false));

        var result = mvc.perform(post("/api/ai/assist")
                .contentType("application/json")
                .content("""
                    {"action":"hint","bookId":"%s","pageNumber":1,"exerciseId":"blank-01"}
                    """.formatted(UUID.randomUUID())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("success"))
            .andExpect(jsonPath("$.content").value("A hint"))
            .andReturn();

        var cookie = result.getResponse().getHeader("Set-Cookie");
        assertThat(cookie).contains("lexora_ai_session=");
        assertThat(cookie).contains("HttpOnly");
        assertThat(cookie).contains("SameSite=Lax");
    }

    @Test
    void invalidActionIsRejectedAsBadRequest() throws Exception {
        when(sessionService.newSessionId()).thenReturn("x");
        when(service.assist(any(), eq("x"), any()))
            .thenThrow(new IllegalArgumentException("Unsupported assist action"));

        mvc.perform(post("/api/ai/assist")
                .contentType("application/json")
                .content("""
                    {"action":"chat","bookId":"%s","pageNumber":1,"exerciseId":"blank-01"}
                    """.formatted(UUID.randomUUID())))
            .andExpect(status().isBadRequest());
    }

    @Test
    void existingSessionCookieIsPreserved() throws Exception {
        var session = "existing-session-id";
        when(service.assist(any(), eq(session), any()))
            .thenReturn(AssistResponse.status("hint", "disabled", null));

        var result = mvc.perform(post("/api/ai/assist")
                .contentType("application/json")
                .cookie(new jakarta.servlet.http.Cookie(AnonymousSessionService.COOKIE_NAME, session))
                .content("""
                    {"action":"hint","bookId":"%s","pageNumber":1,"exerciseId":"blank-01"}
                    """.formatted(UUID.randomUUID())))
            .andExpect(status().isOk())
            .andReturn();

        assertThat(result.getResponse().getHeader("Set-Cookie"))
            .contains("lexora_ai_session=" + session);
        verify(sessionService).ensureSession(session);
    }
}
