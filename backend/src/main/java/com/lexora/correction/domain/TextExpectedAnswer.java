package com.lexora.correction.domain;

import com.fasterxml.jackson.annotation.JsonTypeName;

import java.util.List;

@JsonTypeName("Text")
public record TextExpectedAnswer(
    String value,
    List<String> alternatives
) implements TypedPayload {
    public TextExpectedAnswer {
        alternatives = alternatives == null ? List.of() : List.copyOf(alternatives);
    }

    public TextExpectedAnswer(String value) {
        this(value, List.of());
    }
}
