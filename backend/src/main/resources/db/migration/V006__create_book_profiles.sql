-- BookProfile: TOC-derived structure of a physical workbook edition, used to
-- resolve exercise pages (PDF page) to globally-numbered units and to scope
-- answer-key entries by unitNumber. Additive and idempotent; seed row carries
-- the validated Grammatik aktiv A1-B1 (Aktualisierte Ausgabe) profile.

CREATE TABLE IF NOT EXISTS book_profiles (
    id UUID PRIMARY KEY,
    publisher VARCHAR(100) NOT NULL,
    edition_key VARCHAR(200) NOT NULL UNIQUE,
    metadata JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE books ADD COLUMN IF NOT EXISTS book_profile_id UUID REFERENCES book_profiles(id);

CREATE INDEX IF NOT EXISTS idx_books_book_profile_id ON books(book_profile_id);

INSERT INTO book_profiles (id, publisher, edition_key, metadata)
VALUES (
    'a1b2c3d4-e5f6-4789-8a9b-0c1d2e3f4a5b',
    'cornelsen',
    'grammatik-aktiv-a1-b1-aktualisiert',
    $${
      "printedPageOffset": 4,
      "units": [
        {"unitNumber": 1, "title": "Ich, du, er, sie, es, wir, ihr, sie und Sie", "printedStartPage": 10},
        {"unitNumber": 2, "title": "Ich kamme, du kommst", "printedStartPage": 12},
        {"unitNumber": 3, "title": "Ich bin, du hast, er möchte", "printedStartPage": 14},
        {"unitNumber": 4, "title": "Ich esse wenig, aber du isst viel!", "printedStartPage": 16},
        {"unitNumber": 5, "title": "Ich muss, ich kann, ich will", "printedStartPage": 18},
        {"unitNumber": 6, "title": "Ich kann, ich will, ich möchte", "printedStartPage": 20},
        {"unitNumber": 7, "title": "Ich muss, ich soll, ich darf", "printedStartPage": 22},
        {"unitNumber": 8, "title": "Ich kaufe im Supermarkt ein", "printedStartPage": 24},
        {"unitNumber": 9, "title": "Helfen Sie mir!", "printedStartPage": 26},
        {"unitNumber": 10, "title": "Wer? Wie? Wo? Was?", "printedStartPage": 30},
        {"unitNumber": 11, "title": "Lernen Sie Deutsch?", "printedStartPage": 32},
        {"unitNumber": 12, "title": "Am Abend essen wir Pizza", "printedStartPage": 34},
        {"unitNumber": 13, "title": "Ich gehe ... schwimmen", "printedStartPage": 36},
        {"unitNumber": 14, "title": "Die Männer, die Frauen, die Babys", "printedStartPage": 40},
        {"unitNumber": 15, "title": "Der, das die – ein, ein, eine", "printedStartPage": 42},
        {"unitNumber": 16, "title": "Ich koche nicht. Ich habe keine Zeit.", "printedStartPage": 44},
        {"unitNumber": 17, "title": "Der Mann isst den Fisch", "printedStartPage": 46},
        {"unitNumber": 18, "title": "Ich fahre mit dem Auto", "printedStartPage": 48},
        {"unitNumber": 19, "title": "Mein, dein, unser", "printedStartPage": 50},
        {"unitNumber": 20, "title": "Welcher? -Dieser!", "printedStartPage": 52},
        {"unitNumber": 21, "title": "Nur mit dir – nie ohne dich", "printedStartPage": 54},
        {"unitNumber": 22, "title": "Ich kaufe meinem Sohn einen Ball", "printedStartPage": 56},
        {"unitNumber": 23, "title": "Ich helfe dir, du dankst mir", "printedStartPage": 58},
        {"unitNumber": 24, "title": "Wem schenkst du was?", "printedStartPage": 60},
        {"unitNumber": 25, "title": "Ich war, ich hatte", "printedStartPage": 64},
        {"unitNumber": 26, "title": "Was hast du gestern gemacht?", "printedStartPage": 66},
        {"unitNumber": 27, "title": "Ich bin gekommen, ich habe gelacht", "printedStartPage": 68},
        {"unitNumber": 28, "title": "Gesehen - eingekauft - bezahlt", "printedStartPage": 70},
        {"unitNumber": 29, "title": "Praeteritum: Modalverben", "printedStartPage": 71},
        {"unitNumber": 30, "title": "Gestern hatte er Zeit und hat Sport gemacht", "printedStartPage": 72},
        {"unitNumber": 31, "title": "Sie wäscht sich", "printedStartPage": 74},
        {"unitNumber": 32, "title": "Im, am, um, von... bis, nach, vor", "printedStartPage": 80},
        {"unitNumber": 33, "title": "Aus, bei, mit, nach, seit, von, zu", "printedStartPage": 82},
        {"unitNumber": 34, "title": "Für, um, durch, ohne, gegen", "printedStartPage": 84},
        {"unitNumber": 35, "title": "Wo? Im Kino", "printedStartPage": 86},
        {"unitNumber": 36, "title": "Im Kino oder ins Kino?", "printedStartPage": 88},
        {"unitNumber": 37, "title": "Ich gehe zum Arzt und auf den Markt", "printedStartPage": 90},
        {"unitNumber": 38, "title": "Ich war beim Arzt und bin jetzt auf dem Markt", "printedStartPage": 92},
        {"unitNumber": 39, "title": "Ich komme aus den Bergen vom Skifahren", "printedStartPage": 94},
        {"unitNumber": 40, "title": "Ein netter Mann! Ich liebe den netten Mann", "printedStartPage": 98},
        {"unitNumber": 41, "title": "Am ersten Mai", "printedStartPage": 100},
        {"unitNumber": 42, "title": "Schneller als ...", "printedStartPage": 102},
        {"unitNumber": 43, "title": "Der kleinste Mann läuft am schnellsten", "printedStartPage": 104},
        {"unitNumber": 44, "title": "Und, aber, oder, denn", "printedStartPage": 108},
        {"unitNumber": 45, "title": "Deshalb, sonst, dann, danach", "printedStartPage": 110},
        {"unitNumber": 46, "title": "..., weil ich Deutsch lernen möchte.", "printedStartPage": 112},
        {"unitNumber": 47, "title": "Kinderarzt oder Arztkinder?", "printedStartPage": 116},
        {"unitNumber": 48, "title": "Ich bin dann mal weg", "printedStartPage": 118},
        {"unitNumber": 49, "title": "Der, die oder das?", "printedStartPage": 120},
        {"unitNumber": 50, "title": "Was heißt das denn?", "printedStartPage": 122},
        {"unitNumber": 51, "title": "-chen, -lein, -er, -in, -ung", "printedStartPage": 124},
        {"unitNumber": 52, "title": "Nicht und nichts, noch nicht und nicht mehr", "printedStartPage": 126},
        {"unitNumber": 53, "title": "Ich bin oben. Komm auch nach oben.", "printedStartPage": 128},
        {"unitNumber": 54, "title": "Er kam, sah und sagte", "printedStartPage": 130},
        {"unitNumber": 55, "title": "Ich hatte zu lange geschlafen", "printedStartPage": 132},
        {"unitNumber": 56, "title": "Ich wasche mir die Hände", "printedStartPage": 134},
        {"unitNumber": 57, "title": "Kaufe ich ein oder bestelle ich Pizza?", "printedStartPage": 136},
        {"unitNumber": 58, "title": "Sie freut sich über die Blumen", "printedStartPage": 138},
        {"unitNumber": 59, "title": "Daneben, danach, dafür ...", "printedStartPage": 140},
        {"unitNumber": 60, "title": "War, hätte, würde ...", "printedStartPage": 142},
        {"unitNumber": 61, "title": "Wenn ich viel Geld hätte, ...", "printedStartPage": 144},
        {"unitNumber": 62, "title": "Der Baum wird gepflanzt", "printedStartPage": 146},
        {"unitNumber": 63, "title": "Wann wurde der Kölner Dom gebaut?", "printedStartPage": 148},
        {"unitNumber": 64, "title": "Der Präsident wird Japan besuchen", "printedStartPage": 150},
        {"unitNumber": 65, "title": "Werden, werden, werden ..", "printedStartPage": 152},
        {"unitNumber": 66, "title": "Leben und leben lassen", "printedStartPage": 154},
        {"unitNumber": 67, "title": "Stehen/stellen, sitzen/setzen, liegen/legen und haengen", "printedStartPage": 156},
        {"unitNumber": 68, "title": "Das Auto seines Vaters", "printedStartPage": 160},
        {"unitNumber": 69, "title": "Kennen Sie den Herrn?", "printedStartPage": 162},
        {"unitNumber": 70, "title": "Der Jugendliche – ein Jugendlicher", "printedStartPage": 164},
        {"unitNumber": 71, "title": "Alles Gute!", "printedStartPage": 166},
        {"unitNumber": 72, "title": "Wissen Sie, ob ...?", "printedStartPage": 170},
        {"unitNumber": 73, "title": "Es ist schön, ein Fest zu feiern.", "printedStartPage": 172},
        {"unitNumber": 74, "title": "Ich will singen, lass mich singen!", "printedStartPage": 174},
        {"unitNumber": 75, "title": "Das ist der Mann, der immer meine Nachbarin besucht", "printedStartPage": 176},
        {"unitNumber": 76, "title": "Wie heißt das Ding, mit dem man ...?", "printedStartPage": 178},
        {"unitNumber": 77, "title": "Ich gehe, wenn ... / Ich ging, als ...", "printedStartPage": 180},
        {"unitNumber": 78, "title": "Während, bevor, nachdem, seit", "printedStartPage": 182},
        {"unitNumber": 79, "title": "Um ... zu und damit", "printedStartPage": 184},
        {"unitNumber": 80, "title": "Entweder ... oder, weder .. noch, sowohl ...", "printedStartPage": 186},
        {"unitNumber": 81, "title": "Je größer, desto besser!", "printedStartPage": 188},
        {"unitNumber": 82, "title": "Während, wegen, trotz, innerhalb, außerhalb", "printedStartPage": 192},
        {"unitNumber": 83, "title": "Innerhalb, außerhalb, in, nach, vor, seit, bei, während", "printedStartPage": 194},
        {"unitNumber": 84, "title": "Deutsches Bier", "printedStartPage": 196},
        {"unitNumber": 85, "title": "Schwimmende Vögel und fliegende Fische", "printedStartPage": 198}
      ],
      "loesungenPdfRange": {"from": 198, "to": 230},
      "nonUnitPrintedRanges": [
        {"from": 28, "to": 29},
        {"from": 158, "to": 159},
        {"from": 190, "to": 191},
        {"from": 200, "to": 201}
      ]
    }$$
)
ON CONFLICT (edition_key) DO NOTHING;
