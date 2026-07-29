package com.lexora.shared.error;

public record ApiError(String code, String message, Object details) {
    public static ApiError of(String code, String message) {
        return new ApiError(code, message, null);
    }
}
