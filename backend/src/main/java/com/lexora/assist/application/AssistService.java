package com.lexora.assist.application;

import com.lexora.assist.client.AssistClient;
import com.lexora.assist.client.AssistUnavailableException;
import com.lexora.assist.contract.AssistContext;
import com.lexora.assist.contract.AssistContract;
import com.lexora.assist.contract.AssistContract.AssistRequest;
import com.lexora.assist.contract.AssistContract.AssistResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Orchestrates one bounded AI-assistance request end to end. Order of gates is
 * deliberate: kill switch, request validation, canonical context + deterministic
 * grading precedence, human verification, cache, quotas, provider call.
 */
@Service
public class AssistService {

    private static final Logger log = LoggerFactory.getLogger(AssistService.class);
    private static final Set<String> TARGET_LANGUAGES = Set.of("en", "es");
    private static final String PROMPT_VERSION = "2-selection-intent";

    private final AssistConfiguration configuration;
    private final AssistContextBuilder contextBuilder;
    private final TurnstileVerifier turnstileVerifier;
    private final AnonymousSessionService sessionService;
    private final AssistQuotaService quotaService;
    private final AssistCacheService cacheService;
    private final AssistClient assistClient;

    public AssistService(AssistConfiguration configuration,
                         AssistContextBuilder contextBuilder,
                         TurnstileVerifier turnstileVerifier,
                         AnonymousSessionService sessionService,
                         AssistQuotaService quotaService,
                         AssistCacheService cacheService,
                         AssistClient assistClient) {
        this.configuration = configuration;
        this.contextBuilder = contextBuilder;
        this.turnstileVerifier = turnstileVerifier;
        this.sessionService = sessionService;
        this.quotaService = quotaService;
        this.cacheService = cacheService;
        this.assistClient = assistClient;
    }

    public AssistContract.AssistConfig config() {
        return new AssistContract.AssistConfig(
            configuration.enabled(), configuration.turnstileSiteKey());
    }

    public AssistContract.AssistConfig config(String sessionId, Instant now) {
        return new AssistContract.AssistConfig(
            configuration.enabled(), configuration.turnstileSiteKey(),
            quotaService.snapshot(sessionId, usageDate(now)));
    }

    public AssistResponse assist(AssistRequest request, String sessionId, Instant now) {
        String action = request.action();
        if (!configuration.enabled()) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_DISABLED, null), sessionId, now);
        }
        if (action == null || !AssistContract.ACTIONS.contains(action)) {
            throw new IllegalArgumentException("Unsupported assist action");
        }

        UUID bookId;
        try {
            bookId = UUID.fromString(request.bookId());
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Invalid book id");
        }
        String targetLanguage = resolveTargetLanguage(action, request.targetLanguage());

        boolean hasSelection = request.selection() != null;
        if (hasSelection && request.exerciseId() != null) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_INVALID_CONTEXT,
                "Choose either an exercise or a page selection, not both."), sessionId, now);
        }
        if (hasSelection && AssistContract.ACTION_HINT.equals(action)) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_NOT_APPLICABLE,
                "Hints are available for the active exercise. Ask about the selected region instead."), sessionId, now);
        }
        if (hasSelection && AssistContract.ACTION_CHECK.equals(action)) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_NOT_APPLICABLE,
                "Check with AI applies to an exercise answer, not a page selection."), sessionId, now);
        }
        if (AssistContract.ACTION_ASK.equals(action)
            && (request.question() == null || request.question().isBlank())) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_NOT_APPLICABLE,
                "Write a question first."), sessionId, now);
        }
        if (request.question() != null
            && request.question().length() > AssistContract.MAX_QUESTION_CHARS) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_NOT_APPLICABLE,
                "Keep the question under 400 characters."), sessionId, now);
        }

        var built = hasSelection
            ? contextBuilder.buildSelection(bookId, request.pageNumber(), request.selection(),
                request.question(), targetLanguage)
            : request.question() == null
                ? contextBuilder.build(bookId, request.pageNumber(), request.exerciseId(),
                    request.answer(), targetLanguage)
                : contextBuilder.build(bookId, request.pageNumber(), request.exerciseId(),
                    request.answer(), targetLanguage, request.question());
        if (built == null) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_INVALID_CONTEXT,
                "We couldn't connect that request to the source. Try another exercise or selection."), sessionId, now);
        }
        if (AssistContract.ACTION_CHECK.equals(action)) {
            if (request.answer() == null || request.answer().isBlank()) {
                return withQuota(AssistResponse.status(action, AssistContract.STATUS_NOT_APPLICABLE,
                    "Add an answer first."), sessionId, now);
            }
            if (built.sourceBacked()) {
                return withQuota(AssistResponse.status(action, AssistContract.STATUS_NOT_APPLICABLE,
                    "This exercise has a source-backed answer, so Lexora's own grading applies."), sessionId, now);
            }
        }

        if (configuration.turnstileConfigured()
            && !sessionService.isVerified(sessionId, now)) {
            var token = request.turnstileToken();
            if (token == null || token.isBlank() || !turnstileVerifier.verify(token)) {
                log.info("assist outcome=verification_required action={} provider={} model={}",
                    action, configuration.provider(), configuration.model());
                return withQuota(AssistResponse.verificationRequired(action, configuration.turnstileSiteKey()), sessionId, now);
            }
            sessionService.markVerified(sessionId, now);
        }

        String cacheKey = cacheKey(action, bookId, request.pageNumber(),
            request.exerciseId(), targetLanguage, request.answer(), request.question(),
            request.selection());
        var cached = cacheService.get(cacheKey,
            AssistContract.ACTION_CHECK.equals(action) || AssistContract.ACTION_ASK.equals(action), now);
        if (cached.isPresent()) {
            log.info("assist outcome=cache_hit action={} provider={} model={}",
                action, configuration.provider(), configuration.model());
            return withQuota(AssistResponse.success(action, cached.get().content(),
                cached.get().verdict(), true), sessionId, now);
        }

        var quota = quotaService.tryReserve(sessionId, usageDate(now));
        if (quota == AssistQuotaService.Outcome.SESSION_LIMIT_REACHED) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_LIMIT_REACHED,
                "Today's demo AI limit has been reached. Try again tomorrow."), sessionId, now);
        }
        if (quota == AssistQuotaService.Outcome.GLOBAL_LIMIT_REACHED) {
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_LIMIT_REACHED,
                "AI help has reached today's demo limit. Please try again tomorrow."), sessionId, now);
        }

        try {
            long started = System.nanoTime();
            var result = assistClient.assist(action, built.context());
            cacheService.put(cacheKey, action, result.content(), result.verdict());
            log.info("assist outcome=provider_call action={} provider={} model={} latency_ms={}",
                action, configuration.provider(), configuration.model(),
                (System.nanoTime() - started) / 1_000_000);
            return withQuota(AssistResponse.success(action, result.content(), result.verdict(), false), sessionId, now);
        } catch (AssistUnavailableException e) {
            log.info("assist outcome=provider_failure category=provider_unavailable action={} provider={} model={}",
                action, configuration.provider(), configuration.model());
            return withQuota(AssistResponse.status(action, AssistContract.STATUS_UNAVAILABLE,
                "AI help is temporarily unavailable. Please try again."), sessionId, now);
        }
    }

    private AssistResponse withQuota(AssistResponse response, String sessionId, Instant now) {
        var snapshot = quotaService.snapshot(sessionId, usageDate(now));
        return snapshot == null ? response : response.withSessionQuota(snapshot);
    }

    private static LocalDate usageDate(Instant now) {
        return now.atZone(ZoneId.systemDefault()).toLocalDate();
    }

    private static String resolveTargetLanguage(String action, String targetLanguage) {
        if (!AssistContract.ACTION_TRANSLATE.equals(action)) {
            return null;
        }
        if (targetLanguage == null || targetLanguage.isBlank()) {
            return "en";
        }
        var normalized = targetLanguage.trim().toLowerCase(Locale.ROOT);
        if (!TARGET_LANGUAGES.contains(normalized)) {
            throw new IllegalArgumentException("Unsupported target language");
        }
        return normalized;
    }

    private String cacheKey(String action, UUID bookId, int pageNumber, String exerciseId,
                            String targetLanguage, String answer, String question,
                            AssistContract.SelectionRect selection) {
        var answerHash = AssistContract.ACTION_CHECK.equals(action)
            ? sha256(answer == null ? "" : answer.trim().toLowerCase(Locale.ROOT))
            : "";
        var questionHash = AssistContract.ACTION_ASK.equals(action)
            ? sha256(question == null ? "" : question.trim())
            : "";
        var selectionKey = selection == null ? "" : String.join(",",
            Double.toString(selection.x()), Double.toString(selection.y()),
            Double.toString(selection.width()), Double.toString(selection.height()));
        var raw = String.join("|",
            configuration.provider(),
            configuration.model(),
            PROMPT_VERSION,
            action,
            bookId.toString(),
            String.valueOf(pageNumber),
            exerciseId == null ? "" : exerciseId,
            targetLanguage == null ? "" : targetLanguage,
            answerHash,
            questionHash,
            selectionKey
        );
        return sha256(raw);
    }

    private static String sha256(String value) {
        try {
            var digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
