package com.lexora.correction.domain;

import com.fasterxml.jackson.annotation.JsonTypeName;

import java.util.List;

@JsonTypeName("Matching")
public record MatchingExpectedAnswer(
    List<MatchingPair> pairs
) implements TypedPayload {
    public MatchingExpectedAnswer {
        pairs = pairs == null ? List.of() : List.copyOf(pairs);
    }
}
