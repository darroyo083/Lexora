package com.lexora.assist.application;

import com.lexora.assist.client.AssistClient;
import com.lexora.assist.client.AssistUnavailableException;
import com.lexora.assist.contract.AssistContext;
import com.lexora.assist.contract.AssistContract.SessionQuota;
import com.lexora.assist.contract.AssistContract.AssistRequest;
import com.lexora.assist.contract.AssistContract.AssistResponse;
import com.lexora.assist.infrastructure.AssistRepository.AssistCacheEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AssistServiceTest {

    private final UUID bookId = UUID.randomUUID();
    private final Instant now = Instant.parse("2025-01-01T00:00:00Z");

    private AssistConfiguration config;
    private AssistContextBuilder contextBuilder;
    private TurnstileVerifier turnstileVerifier;
    private AnonymousSessionService sessionService;
    private AssistQuotaService quotaService;
    private AssistCacheService cacheService;
    private AssistClient assistClient;
    private AssistService service;

    @BeforeEach
    void setUp() {
        config = mock(AssistConfiguration.class);
        contextBuilder = mock(AssistContextBuilder.class);
        turnstileVerifier = mock(TurnstileVerifier.class);
        sessionService = mock(AnonymousSessionService.class);
        quotaService = mock(AssistQuotaService.class);
        cacheService = mock(AssistCacheService.class);
        assistClient = mock(AssistClient.class);
        service = new AssistService(config, contextBuilder, turnstileVerifier,
            sessionService, quotaService, cacheService, assistClient);

        when(config.enabled()).thenReturn(true);
        when(config.provider()).thenReturn("openai");
        when(config.model()).thenReturn("gpt-4o-mini");
        when(config.turnstileConfigured()).thenReturn(false);
        when(config.turnstileSiteKey()).thenReturn("site-key");
        when(config.globalDailyProviderLimit()).thenReturn(100);
        when(config.sessionDailyLimit()).thenReturn(10);
    }

    private AssistRequest request(String action, String answer) {
        return new AssistRequest(action, bookId.toString(), 1, "blank-01",
            answer, null, null);
    }

    private AssistContext context() {
        return new AssistContext("Workbook", "Do the task", "Source text",
            "fill-in-line", List.of(), null, "de", null);
    }

    private AssistContextBuilder.BuiltContext built(boolean sourceBacked) {
        return new AssistContextBuilder.BuiltContext(context(), sourceBacked);
    }

    @Test
    void killSwitchReturnsDisabledWithoutAnyCall() {
        when(config.enabled()).thenReturn(false);

        var response = service.assist(request("hint", null), "session", now);

        assertThat(response.status()).isEqualTo("disabled");
        verify(contextBuilder, never()).build(any(UUID.class), anyInt(), anyString(), any(), any());
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void unknownActionIsRejected() {
        assertThatThrownBy(() -> service.assist(
            new AssistRequest("chat", bookId.toString(), 1, "blank-01", null, null, null),
            "session", now)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void staleExerciseIdentityReturnsInvalidContext() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(null);

        var response = service.assist(request("hint", null), "session", now);

        assertThat(response.status()).isEqualTo("invalid_context");
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void checkOnSourceBackedExerciseNeverCallsProvider() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(true));

        var response = service.assist(request("check", "stehe"), "session", now);

        assertThat(response.status()).isEqualTo("not_applicable");
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void checkWithoutAnswerIsNotApplicable() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));

        var response = service.assist(request("check", ""), "session", now);

        assertThat(response.status()).isEqualTo("not_applicable");
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void unverifiedSessionRequiresTurnstile() {
        when(config.turnstileConfigured()).thenReturn(true);
        when(sessionService.isVerified("session", now)).thenReturn(false);
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));

        var response = service.assist(request("hint", null), "session", now);

        assertThat(response.status()).isEqualTo("verification_required");
        assertThat(response.siteKey()).isEqualTo("site-key");
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void invalidTurnstileTokenIsRejected() {
        when(config.turnstileConfigured()).thenReturn(true);
        when(sessionService.isVerified("session", now)).thenReturn(false);
        when(turnstileVerifier.verify("bad-token")).thenReturn(false);
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));

        var response = service.assist(
            new AssistRequest("hint", bookId.toString(), 1, "blank-01", null, null, "bad-token"),
            "session", now);

        assertThat(response.status()).isEqualTo("verification_required");
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void validTurnstileTokenMarksVerifiedAndProceeds() {
        when(config.turnstileConfigured()).thenReturn(true);
        when(sessionService.isVerified("session", now)).thenReturn(false);
        when(turnstileVerifier.verify("good-token")).thenReturn(true);
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));
        when(quotaService.tryReserve(eq("session"), any())).thenReturn(AssistQuotaService.Outcome.ALLOWED);
        when(assistClient.assist("hint", context()))
            .thenReturn(new AssistClient.AssistResult("hint", "A hint", null));

        var response = service.assist(
            new AssistRequest("hint", bookId.toString(), 1, "blank-01", null, null, "good-token"),
            "session", now);

        assertThat(response.status()).isEqualTo("success");
        verify(sessionService).markVerified("session", now);
        verify(assistClient).assist("hint", context());
    }

    @Test
    void cacheHitDoesNotConsumeQuotaOrProvider() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));
        when(cacheService.get(any(), anyBoolean(), any())).thenReturn(Optional.of(
            new AssistCacheEntry("hint", "Cached hint", null, now)));

        var response = service.assist(request("hint", null), "session", now);

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.cached()).isTrue();
        assertThat(response.content()).isEqualTo("Cached hint");
        verify(quotaService, never()).tryReserve(any(), any());
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void sessionLimitReachedReturnsCleanState() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));
        when(cacheService.get(any(), anyBoolean(), any())).thenReturn(Optional.empty());
        when(quotaService.tryReserve(eq("session"), any()))
            .thenReturn(AssistQuotaService.Outcome.SESSION_LIMIT_REACHED);

        var response = service.assist(request("hint", null), "session", now);

        assertThat(response.status()).isEqualTo("limit_reached");
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void globalLimitReachedReturnsCleanState() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));
        when(cacheService.get(any(), anyBoolean(), any())).thenReturn(Optional.empty());
        when(quotaService.tryReserve(eq("session"), any()))
            .thenReturn(AssistQuotaService.Outcome.GLOBAL_LIMIT_REACHED);

        var response = service.assist(request("hint", null), "session", now);

        assertThat(response.status()).isEqualTo("limit_reached");
        verify(assistClient, never()).assist(anyString(), any());
    }

    @Test
    void providerFailureReturnsUnavailableAndIsNotCached() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));
        when(cacheService.get(any(), anyBoolean(), any())).thenReturn(Optional.empty());
        when(quotaService.tryReserve(eq("session"), any())).thenReturn(AssistQuotaService.Outcome.ALLOWED);
        when(assistClient.assist(anyString(), any()))
            .thenThrow(new AssistUnavailableException("down"));

        var response = service.assist(request("hint", null), "session", now);

        assertThat(response.status()).isEqualTo("unavailable");
        verify(cacheService, never()).put(any(), any(), any(), any());
    }

    @Test
    void successfulProviderCallIsCached() {
        when(contextBuilder.build(any(UUID.class), anyInt(), anyString(), any(), any())).thenReturn(built(false));
        when(cacheService.get(any(), anyBoolean(), any())).thenReturn(Optional.empty());
        when(quotaService.tryReserve(eq("session"), any())).thenReturn(AssistQuotaService.Outcome.ALLOWED);
        when(quotaService.snapshot(eq("session"), any())).thenReturn(new SessionQuota(4, 10, 6));
        when(assistClient.assist("check", context()))
            .thenReturn(new AssistClient.AssistResult("check", "Rationale", "likely_correct"));

        var response = service.assist(request("check", "stehe"), "session", now);

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.verdict()).isEqualTo("likely_correct");
        assertThat(response.sessionQuota()).isEqualTo(new SessionQuota(4, 10, 6));
        verify(cacheService).put(any(), any(), any(), any());
    }

    @Test
    void invalidTargetLanguageIsRejected() {
        assertThatThrownBy(() -> service.assist(
            new AssistRequest("translate", bookId.toString(), 1, "blank-01", null, "xx", null),
            "session", now)).isInstanceOf(IllegalArgumentException.class);
    }
}
