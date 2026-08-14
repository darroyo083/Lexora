package com.lexora.assist.contract;

import java.util.List;

/**
 * Canonical, server-reconstructed exercise context sent to the internal
 * ai-service. Built only from Lexora's own trusted data; never from raw
 * client-supplied source text.
 */
public record AssistContext(
    String title,
    String instruction,
    String source,
    String exerciseKind,
    List<String> options,
    String answer,
    String sourceLanguage,
    String targetLanguage
) {
    public AssistContext {
        options = options == null ? List.of() : List.copyOf(options);
    }
}
