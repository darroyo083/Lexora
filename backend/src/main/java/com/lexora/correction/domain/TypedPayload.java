package com.lexora.correction.domain;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.EXISTING_PROPERTY,
    property = "type"
)
@JsonSubTypes({
    @JsonSubTypes.Type(value = TextExpectedAnswer.class, name = "Text"),
    @JsonSubTypes.Type(value = MatchingExpectedAnswer.class, name = "Matching"),
    @JsonSubTypes.Type(value = ReferenceExpectedAnswer.class, name = "Reference")
})
public sealed interface TypedPayload
    permits TextExpectedAnswer, MatchingExpectedAnswer, ReferenceExpectedAnswer {
}
