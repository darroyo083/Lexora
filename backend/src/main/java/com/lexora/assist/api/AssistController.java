package com.lexora.assist.api;

import com.lexora.assist.application.AnonymousSessionService;
import com.lexora.assist.application.AssistConfiguration;
import com.lexora.assist.application.AssistService;
import com.lexora.assist.contract.AssistContract.AssistConfig;
import com.lexora.assist.contract.AssistContract.AssistRequest;
import com.lexora.assist.contract.AssistContract.AssistResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/**
 * The single narrow public entry point for Contextual AI Assistance.
 * No prompt, proxy, or arbitrary-message API exists; the browser supplies only
 * strict identifiers and the current answer, plus a Turnstile token.
 */
@RestController
@RequestMapping("/api/ai")
public class AssistController {

    private final AssistService service;
    private final AnonymousSessionService sessionService;
    private final AssistConfiguration configuration;

    public AssistController(AssistService service,
                            AnonymousSessionService sessionService,
                            AssistConfiguration configuration) {
        this.service = service;
        this.sessionService = sessionService;
        this.configuration = configuration;
    }

    @GetMapping("/assist/config")
    public AssistConfig config(HttpServletRequest httpRequest,
                               HttpServletResponse httpResponse) {
        var sessionId = readSessionId(httpRequest);
        if (sessionId == null) {
            sessionId = sessionService.newSessionId();
        }
        sessionService.ensureSession(sessionId);
        setSessionCookie(httpResponse, sessionId);
        return service.config(sessionId, Instant.now());
    }

    @PostMapping("/assist")
    public AssistResponse assist(@RequestBody AssistRequest request,
                                 HttpServletRequest httpRequest,
                                 HttpServletResponse httpResponse) {
        var sessionId = readSessionId(httpRequest);
        if (sessionId == null) {
            sessionId = sessionService.newSessionId();
        }
        sessionService.ensureSession(sessionId);
        setSessionCookie(httpResponse, sessionId);
        return service.assist(request, sessionId, Instant.now());
    }

    private static String readSessionId(HttpServletRequest request) {
        var cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (var cookie : cookies) {
            if (AnonymousSessionService.COOKIE_NAME.equals(cookie.getName())) {
                var value = cookie.getValue();
                if (value != null && !value.isBlank() && value.length() <= 128) {
                    return value;
                }
                return null;
            }
        }
        return null;
    }

    private void setSessionCookie(HttpServletResponse response, String sessionId) {
        var cookie = ResponseCookie.from(AnonymousSessionService.COOKIE_NAME, sessionId)
            .httpOnly(true)
            .secure(configuration.production())
            .path("/")
            .sameSite("Lax")
            .maxAge(java.time.Duration.ofDays(365))
            .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }
}
