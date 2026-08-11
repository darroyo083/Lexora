UPDATE book_profiles
SET metadata = $$
{
  "printedPageOffset": 0,
  "units": [
    {"unitNumber": 1, "title": "Mein Morgen", "printedStartPage": 1},
    {"unitNumber": 2, "title": "In der Stadt", "printedStartPage": 2},
    {"unitNumber": 3, "title": "Ein Treffen planen", "printedStartPage": 3},
    {"unitNumber": 4, "title": "Kleine Wiederholung", "printedStartPage": 4}
  ],
  "loesungenPdfRange": {"from": 4, "to": 4},
  "nonUnitPrintedRanges": []
}
$$
WHERE edition_key = 'lexora-public-demo-v1';
