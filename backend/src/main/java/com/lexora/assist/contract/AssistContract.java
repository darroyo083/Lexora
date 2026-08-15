package com.lexora.assist.contract;

import java.util.List;

/**
 * Public contract for the narrow {@code POST /api/ai/assist} endpoint.
 *
 * <p>The request accepts only strict identifiers plus the learner's current
 * answer and a Turnstile token. It never accepts a provider URL, model, API
 * key, system prompt, arbitrary message array, tools, or arbitrary source
 * text. The backend reconstructs canonical context from Lexora's own data.
 */
public final class AssistContract {

    private AssistContract() {}

    public static final String ACTION_HINT = "hint";
    public static final String ACTION_EXPLAIN = "explain";
    public static final String ACTION_TRANSLATE = "translate";
    public static final String ACTION_CHECK = "check";
    public static final String ACTION_ASK = "ask";

    public static final List<String> ACTIONS = List.of(
        ACTION_HINT, ACTION_EXPLAIN, ACTION_TRANSLATE, ACTION_CHECK, ACTION_ASK
    );

    public static final int MAX_QUESTION_CHARS = 400;

    public static final String STATUS_SUCCESS = "success";
    public static final String STATUS_DISABLED = "disabled";
    public static final String STATUS_VERIFICATION_REQUIRED = "verification_required";
    public static final String STATUS_LIMIT_REACHED = "limit_reached";
    public static final String STATUS_UNAVAILABLE = "unavailable";
    public static final String STATUS_NOT_APPLICABLE = "not_applicable";
    public static final String STATUS_INVALID_CONTEXT = "invalid_context";

    /** Inbound request body. */
    public record AssistRequest(
        String action,
        String bookId,
        int pageNumber,
        String exerciseId,
        String answer,
        String targetLanguage,
        String question,
        SelectionRect selection,
        String turnstileToken
    ) {
        public AssistRequest(String action, String bookId, int pageNumber, String exerciseId,
                             String answer, String targetLanguage, String turnstileToken) {
            this(action, bookId, pageNumber, exerciseId, answer, targetLanguage,
                null, null, turnstileToken);
        }
    }

    /** Normalized page-space selection supplied by the Classic reader. */
    public record SelectionRect(double x, double y, double width, double height) {}

    /** Outbound response body. */
    public record AssistResponse(
        String action,
        String status,
        String content,
        String verdict,
        boolean cached,
        String siteKey,
        String message
    ) {
        public static AssistResponse status(String action, String status, String message) {
            return new AssistResponse(action, status, null, null, false, null, message);
        }

        public static AssistResponse success(String action, String content,
                                             String verdict, boolean cached) {
            return new AssistResponse(action, STATUS_SUCCESS, content, verdict, cached, null, null);
        }

        public static AssistResponse verificationRequired(String action, String siteKey) {
            return new AssistResponse(action, STATUS_VERIFICATION_REQUIRED, null, null,
                false, siteKey, null);
        }
    }

    /** Public safe config for the frontend. Never carries secrets. */
    public record AssistConfig(boolean enabled, String siteKey) {}
}
