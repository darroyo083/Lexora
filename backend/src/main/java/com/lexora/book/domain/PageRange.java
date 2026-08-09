package com.lexora.book.domain;

public record PageRange(
    int from,
    int to
) {
    public boolean contains(int value) {
        return value >= from && value <= to;
    }
}
