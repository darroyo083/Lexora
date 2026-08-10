INSERT INTO book_profiles (id, publisher, edition_key, metadata)
VALUES (
    '00000000-0000-4000-8000-000000000002',
    'lexora',
    'lexora-public-demo-v1',
    $$
    {
      "printedPageOffset": 0,
      "units": [
        {"unitNumber": 1, "title": "A deliberate daily practice", "printedStartPage": 1},
        {"unitNumber": 2, "title": "Why repetition works", "printedStartPage": 2},
        {"unitNumber": 3, "title": "Source-first fallback", "printedStartPage": 3}
      ],
      "loesungenPdfRange": {"from": 4, "to": 4},
      "nonUnitPrintedRanges": []
    }
    $$
)
ON CONFLICT (edition_key) DO NOTHING;
