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
    public static final int PAGE_COUNT = 4;
    public static final String SOURCE_SHA256 =
        "1d5ddb54822d9bfd80840fd11412f25c51e2a7535b4a4677b93719545c729e9c";
    public static final String ANALYSIS_SCHEMA_VERSION = "0.2.0";

    private PublicDemoConstants() {}
}
