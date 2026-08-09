package com.lexora.book.application;

import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.PageRange;
import com.lexora.book.domain.UnitRef;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Test fixture: the real validated Grammatik aktiv A1-B1 (Aktualisierte
 * Ausgabe) profile, mirroring the V006 seed (unitNumber + printedStartPage
 * exact; titles irrelevant for resolution).
 */
public final class BookProfileFixtures {

    private BookProfileFixtures() {}

    public static final UUID PROFILE_ID = UUID.fromString("a1b2c3d4-e5f6-4789-8a9b-0c1d2e3f4a5b");

    private static final String UNITS_SPEC = """
        1:10 2:12 3:14 4:16 5:18 6:20 7:22 8:24 9:26 10:30 11:32 12:34 13:36 14:40 15:42
        16:44 17:46 18:48 19:50 20:52 21:54 22:56 23:58 24:60 25:64 26:66 27:68 28:70 29:71
        30:72 31:74 32:80 33:82 34:84 35:86 36:88 37:90 38:92 39:94 40:98 41:100 42:102 43:104
        44:108 45:110 46:112 47:116 48:118 49:120 50:122 51:124 52:126 53:128 54:130 55:132
        56:134 57:136 58:138 59:140 60:142 61:144 62:146 63:148 64:150 65:152 66:154 67:156
        68:160 69:162 70:164 71:166 72:170 73:172 74:174 75:176 76:178 77:180 78:182 79:184
        80:186 81:188 82:192 83:194 84:196 85:198
        """;

    public static BookProfile realGrammatikAktivProfile() {
        return new BookProfile(
            PROFILE_ID,
            "cornelsen",
            "grammatik-aktiv-a1-b1-aktualisiert",
            4,
            units(UNITS_SPEC),
            new PageRange(198, 230),
            List.of(
                new PageRange(28, 29),
                new PageRange(158, 159),
                new PageRange(190, 191),
                new PageRange(200, 201)
            )
        );
    }

    private static List<UnitRef> units(String spec) {
        var units = new ArrayList<UnitRef>();
        for (var pair : spec.trim().split("\\s+")) {
            var parts = pair.split(":");
            int unitNumber = Integer.parseInt(parts[0]);
            units.add(new UnitRef(unitNumber, "unit " + unitNumber, Integer.parseInt(parts[1])));
        }
        return List.copyOf(units);
    }
}
