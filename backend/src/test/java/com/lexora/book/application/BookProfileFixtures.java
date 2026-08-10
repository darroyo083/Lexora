package com.lexora.book.application;

import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.PageRange;
import com.lexora.book.domain.UnitRef;

import java.util.List;
import java.util.UUID;

/** Public-safe synthetic profile for page-resolution tests. */
public final class BookProfileFixtures {

    private BookProfileFixtures() {}

    public static final UUID PROFILE_ID = UUID.fromString("10000000-0000-4000-8000-000000000001");

    public static BookProfile syntheticProfile() {
        return new BookProfile(
            PROFILE_ID,
            "synthetic",
            "synthetic-workbook-v1",
            2,
            List.of(
                new UnitRef(1, "Introductions", 3),
                new UnitRef(2, "Daily routines", 7),
                new UnitRef(3, "Directions", 10),
                new UnitRef(4, "Review", 14)
            ),
            new PageRange(18, 20),
            List.of(new PageRange(5, 6), new PageRange(12, 13))
        );
    }
}
