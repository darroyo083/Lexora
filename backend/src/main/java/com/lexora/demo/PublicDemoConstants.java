package com.lexora.demo;

import java.util.UUID;

public final class PublicDemoConstants {
    public static final UUID BOOK_ID = UUID.fromString(
        "00000000-0000-4000-8000-000000000001"
    );
    public static final UUID PROFILE_ID = UUID.fromString(
        "00000000-0000-4000-8000-000000000002"
    );
    public static final String STORAGE_KEY = "lexora-public-demo.pdf";

    private PublicDemoConstants() {}
}
