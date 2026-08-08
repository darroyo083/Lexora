package com.lexora.correction.domain;

import com.fasterxml.jackson.annotation.JsonTypeName;

@JsonTypeName("Reference")
public record ReferenceExpectedAnswer(
    String modelText,
    String sourceHint
) implements TypedPayload {
    public ReferenceExpectedAnswer {
        sourceHint = sourceHint == null ? "" : sourceHint;
    }

    public ReferenceExpectedAnswer(String modelText) {
        this(modelText, "");
    }
}
