"""Generate Lexora's original, copyright-safe public demo workbook.

The content and layout in this file were created specifically for Lexora. It
does not depend on, trace, or reproduce a commercial workbook.
"""

from __future__ import annotations

from pathlib import Path
import textwrap

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "backend" / "src" / "main" / "resources" / "demo" / "lexora-synthetic-workbook.pdf"
TEMP = OUTPUT.with_suffix(".unsealed.pdf")

WIDTH, HEIGHT = 1240, 1754
MARGIN = 88
INK = "#17211b"
MUTED = "#657168"
PAPER = "#f7f4ec"
CARD = "#ffffff"
LINE = "#d6ddd4"
GREEN = "#275c45"
MINT = "#dbeade"
AMBER = "#d8a431"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    fonts = Path("C:/Windows/Fonts")
    candidates = {
        "regular": ["segoeui.ttf", "arial.ttf"],
        "semibold": ["seguisb.ttf", "arialbd.ttf"],
        "bold": ["segoeuib.ttf", "arialbd.ttf"],
    }
    for filename in candidates[name]:
        path = fonts / filename
        if path.exists():
            return ImageFont.truetype(str(path), size)
    raise RuntimeError(f"No suitable {name} font found")


F = {
    "eyebrow": font("bold", 20),
    "title": font("bold", 54),
    "subtitle": font("regular", 25),
    "section": font("bold", 30),
    "body": font("regular", 24),
    "body_bold": font("semibold", 24),
    "small": font("regular", 19),
    "token": font("semibold", 23),
}


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int = 24, *, fill=CARD, outline=LINE, width=2) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], width: int, *, face=F["body"], fill=INK, spacing=10) -> int:
    avg = max(8, int(width / (face.size * 0.53)))
    lines = textwrap.wrap(text, width=avg, break_long_words=False)
    draw.multiline_text(xy, "\n".join(lines), font=face, fill=fill, spacing=spacing)
    bbox = draw.multiline_textbbox(xy, "\n".join(lines), font=face, spacing=spacing)
    return bbox[3]


def header(draw: ImageDraw.ImageDraw, unit: str, title: str, subtitle: str, page: int) -> int:
    draw.text((MARGIN, 64), "DEUTSCH ENTDECKEN  /  A1-A2", font=F["eyebrow"], fill=GREEN)
    draw.text((WIDTH - MARGIN, 64), f"{page:02d}", font=F["eyebrow"], fill=MUTED, anchor="ra")
    draw.text((MARGIN, 114), unit.upper(), font=F["eyebrow"], fill=AMBER)
    draw.text((MARGIN, 150), title, font=F["title"], fill=INK)
    y = wrapped(draw, subtitle, (MARGIN, 222), WIDTH - 2 * MARGIN, face=F["subtitle"], fill=MUTED, spacing=8)
    draw.line((MARGIN, y + 30, WIDTH - MARGIN, y + 30), fill=LINE, width=2)
    return y + 66


def card(draw: ImageDraw.ImageDraw, y: int, height: int, number: str, title: str, instruction: str) -> int:
    rounded(draw, (MARGIN, y, WIDTH - MARGIN, y + height))
    draw.ellipse((MARGIN + 28, y + 26, MARGIN + 72, y + 70), fill=GREEN)
    draw.text((MARGIN + 50, y + 48), number, font=F["eyebrow"], fill="white", anchor="mm")
    draw.text((MARGIN + 92, y + 25), title, font=F["section"], fill=INK)
    draw.text((MARGIN + 92, y + 69), instruction, font=F["small"], fill=MUTED)
    return y + 116


def footer(draw: ImageDraw.ImageDraw) -> None:
    draw.text((MARGIN, HEIGHT - 62), "Originales synthetisches Übungsmaterial für Lexora", font=F["small"], fill=MUTED)
    draw.text((WIDTH - MARGIN, HEIGHT - 62), "Seite für die öffentliche Demo", font=F["small"], fill=GREEN, anchor="ra")


def page_one() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(image)
    y = header(d, "Lektion 1", "Mein Morgen", "Tagesabläufe beschreiben und über Gewohnheiten sprechen.", 1)

    body = card(d, y, 390, "1", "Lücken ergänzen", "Ergänze die Sätze mit der passenden Verbform.")
    prompts = [
        ("a", "Jeden Morgen", "ich um sieben Uhr auf.", "aufstehen"),
        ("b", "Danach", "ich Tee in der Küche.", "trinken"),
        ("c", "Um acht Uhr", "ich mit dem Fahrrad zur Arbeit.", "fahren"),
    ]
    for index, (label, before, after, hint) in enumerate(prompts):
        yy = body + index * 82
        d.text((MARGIN + 42, yy), f"{label})", font=F["body_bold"], fill=GREEN)
        d.text((MARGIN + 92, yy), before, font=F["body"], fill=INK)
        x = MARGIN + 92 + d.textlength(before, font=F["body"]) + 16
        d.line((x, yy + 32, x + 218, yy + 32), fill=INK, width=3)
        d.text((x + 236, yy), after, font=F["body"], fill=INK)
        d.text((WIDTH - MARGIN - 34, yy + 3), f"({hint})", font=F["small"], fill=MUTED, anchor="ra")

    y += 422
    body = card(d, y, 390, "2", "Die passende Antwort", "Wähle für jede Frage die richtige Antwort.")
    questions = [
        ("Wann stehst du auf?", ["Um sieben Uhr", "Im Park", "Mit Anna"]),
        ("Was trinkst du morgens?", ["Einen Tee", "Nach Berlin", "Sehr langsam"]),
    ]
    for row, (question, options) in enumerate(questions):
        yy = body + row * 132
        d.text((MARGIN + 42, yy), question, font=F["body_bold"], fill=INK)
        ox = MARGIN + 42
        for option in options:
            oy = yy + 55
            d.ellipse((ox, oy + 3, ox + 24, oy + 27), outline=GREEN, width=3)
            d.text((ox + 36, oy), option, font=F["small"], fill=INK)
            ox += 300

    y += 422
    body = card(d, y, 250, "3", "Kurz schreiben", "Schreibe zwei Sätze über deinen eigenen Morgen.")
    d.text((MARGIN + 42, body), "Am Morgen ...", font=F["body_bold"], fill=INK)
    for line in range(3):
        yy = body + 55 + line * 52
        d.line((MARGIN + 42, yy, WIDTH - MARGIN - 42, yy), fill=LINE, width=2)
    footer(d)
    return image


def page_two() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(image)
    y = header(d, "Lektion 2", "In der Stadt", "Orte benennen und sich in der Stadt orientieren.", 2)

    body = card(d, y, 430, "4", "Artikel wählen", "Wähle in jeder Zeile den richtigen Artikel.")
    columns = [("der", 690), ("die", 825), ("das", 960)]
    for label, x in columns:
        d.text((x, body), label, font=F["body_bold"], fill=GREEN, anchor="mm")
    nouns = ["Bahnhof", "Apotheke", "Museum", "Markt"]
    answers = ["der", "die", "das", "der"]
    for row, noun in enumerate(nouns):
        yy = body + 58 + row * 68
        d.line((MARGIN + 40, yy + 46, WIDTH - MARGIN - 40, yy + 46), fill=LINE, width=1)
        d.text((MARGIN + 50, yy), noun, font=F["body"], fill=INK)
        for label, x in columns:
            d.ellipse((x - 14, yy + 2, x + 14, yy + 30), outline=GREEN, width=3)
        d.text((WIDTH - MARGIN - 30, yy + 3), "", font=F["small"], fill=MUTED)
    d.text((MARGIN + 50, body + 350), "Beispiel: der Park", font=F["small"], fill=MUTED)

    y += 462
    body = card(d, y, 510, "5", "Wo findet man das?", "Ordne jedem Ort die passende Sache zu.")
    left = [("1", "die Bäckerei"), ("2", "die Bibliothek"), ("3", "der Bahnhof"), ("4", "die Apotheke")]
    right = [("A", "Medikamente"), ("B", "Züge"), ("C", "Brot"), ("D", "Bücher")]
    for row, ((ln, lt), (rn, rt)) in enumerate(zip(left, right)):
        yy = body + 22 + row * 88
        d.rounded_rectangle((MARGIN + 42, yy, MARGIN + 430, yy + 58), 16, fill=MINT)
        d.text((MARGIN + 70, yy + 29), ln, font=F["body_bold"], fill=GREEN, anchor="lm")
        d.text((MARGIN + 116, yy + 29), lt, font=F["body"], fill=INK, anchor="lm")
        d.rounded_rectangle((WIDTH - MARGIN - 430, yy, WIDTH - MARGIN - 42, yy + 58), 16, fill="#f3ead2")
        d.text((WIDTH - MARGIN - 402, yy + 29), rn, font=F["body_bold"], fill="#855f16", anchor="lm")
        d.text((WIDTH - MARGIN - 354, yy + 29), rt, font=F["body"], fill=INK, anchor="lm")
        d.ellipse((MARGIN + 446, yy + 21, MARGIN + 462, yy + 37), fill=GREEN)
        d.ellipse((WIDTH - MARGIN - 462, yy + 21, WIDTH - MARGIN - 446, yy + 37), fill=AMBER)
    d.text((MARGIN + 42, body + 342), "Verbinde vier Paare. Jeder Ort hat genau einen Partner.", font=F["small"], fill=MUTED)

    y += 542
    body = card(d, y, 200, "6", "Ein Satz", "Ergänze den Satz mit einem passenden Ort.")
    d.text((MARGIN + 42, body + 8), "Ich brauche ein Buch. Ich gehe in die", font=F["body"], fill=INK)
    x = MARGIN + 42 + d.textlength("Ich brauche ein Buch. Ich gehe in die", font=F["body"]) + 16
    d.line((x, body + 42, x + 240, body + 42), fill=INK, width=3)
    d.text((x + 252, body + 8), ".", font=F["body"], fill=INK)
    footer(d)
    return image


def page_three() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(image)
    y = header(d, "Lektion 3", "Ein Treffen planen", "Verabredungen treffen und kurze Nachrichten schreiben.", 3)

    body = card(d, y, 430, "7", "Satzpuzzle", "Bringe die Wortkarten in die richtige Reihenfolge.")
    token_rows = [
        ["Wir", "treffen", "uns", "am", "Samstag"],
        ["Kommst", "du", "um", "halb", "drei"],
    ]
    for row, tokens in enumerate(token_rows):
        yy = body + row * 145
        d.text((MARGIN + 42, yy + 8), f"{chr(97 + row)})", font=F["body_bold"], fill=GREEN)
        x = MARGIN + 94
        displayed = list(reversed(tokens)) if row == 0 else [tokens[2], tokens[0], tokens[4], tokens[1], tokens[3]]
        for token in displayed:
            tw = int(d.textlength(token, font=F["token"])) + 48
            d.rounded_rectangle((x, yy, x + tw, yy + 58), 15, fill=MINT, outline="#b8cfbc", width=2)
            d.text((x + tw / 2, yy + 29), token, font=F["token"], fill=INK, anchor="mm")
            x += tw + 14
        d.line((MARGIN + 94, yy + 92, WIDTH - MARGIN - 42, yy + 92), fill=LINE, width=2)

    y += 462
    body = card(d, y, 430, "8", "Welche Nachricht passt?", "Wähle die passende Antwort.")
    prompts = [
        ("Hast du am Samstag Zeit?", ["Ja, gern!", "Zwei Kaffee.", "Links nebenan."]),
        ("Wo treffen wir uns?", ["Vor dem Kino.", "Am Montag.", "Sehr gut."]),
    ]
    for row, (prompt, options) in enumerate(prompts):
        yy = body + row * 142
        d.text((MARGIN + 42, yy), prompt, font=F["body_bold"], fill=INK)
        ox = MARGIN + 42
        for option in options:
            oy = yy + 58
            d.ellipse((ox, oy + 2, ox + 25, oy + 27), outline=GREEN, width=3)
            d.text((ox + 38, oy), option, font=F["small"], fill=INK)
            ox += 300

    y += 462
    body = card(d, y, 300, "9", "Deine Nachricht", "Schreibe eine Einladung mit Tag, Uhrzeit und Ort.")
    d.text((MARGIN + 42, body), "Hallo! Hast du ...", font=F["body_bold"], fill=INK)
    d.rounded_rectangle((MARGIN + 42, body + 54, WIDTH - MARGIN - 42, body + 166), 14, fill="#fafcf9", outline=LINE, width=2)
    footer(d)
    return image


def page_four() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(image)
    y = header(d, "Lektion 4", "Kleine Wiederholung", "Wichtige Wendungen aus den ersten Lektionen wiederholen.", 4)

    body = card(d, y, 420, "10", "Verbformen", "Ergänze den Mini-Dialog mit den richtigen Verbformen.")
    lines = [
        ("Mira: Wann", "du heute", "?", "arbeiten"),
        ("Noah: Ich", "bis vier Uhr.", "", "arbeiten"),
        ("Mira: Danach", "wir uns im Cafe.", "", "treffen"),
    ]
    for row, (before, after, punctuation, hint) in enumerate(lines):
        yy = body + row * 90
        d.text((MARGIN + 42, yy), before, font=F["body"], fill=INK)
        x = MARGIN + 42 + d.textlength(before, font=F["body"]) + 14
        d.line((x, yy + 33, x + 190, yy + 33), fill=INK, width=3)
        d.text((x + 205, yy), after + punctuation, font=F["body"], fill=INK)
        d.text((WIDTH - MARGIN - 34, yy + 3), f"({hint})", font=F["small"], fill=MUTED, anchor="ra")

    y += 452
    body = card(d, y, 390, "11", "Richtig oder falsch?", "Lies die Notiz und markiere die richtige Antwort.")
    rounded(d, (MARGIN + 42, body, WIDTH - MARGIN - 42, body + 110), 18, fill=MINT, outline="#b8cfbc")
    wrapped(d, "Noah arbeitet bis 16 Uhr. Danach trifft er Mira vor dem Cafe.", (MARGIN + 68, body + 24), WIDTH - 2 * MARGIN - 136, face=F["body"], fill=INK)
    statements = ["Noah arbeitet am Abend.", "Mira und Noah treffen sich nach der Arbeit."]
    for row, statement in enumerate(statements):
        yy = body + 148 + row * 74
        d.text((MARGIN + 42, yy), statement, font=F["body"], fill=INK)
        for label, x in [("richtig", WIDTH - MARGIN - 300), ("falsch", WIDTH - MARGIN - 145)]:
            d.ellipse((x, yy + 2, x + 25, yy + 27), outline=GREEN, width=3)
            d.text((x + 35, yy), label, font=F["small"], fill=INK)

    y += 422
    body = card(d, y, 320, "12", "Mein Lernziel", "Schreibe einen konkreten Satz über dein nächstes Deutschtraining.")
    d.text((MARGIN + 42, body), "Diese Woche möchte ich ...", font=F["body_bold"], fill=INK)
    d.rounded_rectangle((MARGIN + 42, body + 55, WIDTH - MARGIN - 42, body + 184), 14, fill="#fafcf9", outline=LINE, width=2)
    footer(d)
    return image


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pages = [page_one(), page_two(), page_three(), page_four()]
    pages[0].save(
        TEMP,
        "PDF",
        resolution=150.0,
        save_all=True,
        append_images=pages[1:],
    )

    reader = PdfReader(TEMP)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.add_metadata({
        "/Title": "Lexora Synthetic German Workbook",
        "/Author": "Lexora",
        "/Subject": "Original public demo material",
        "/Creator": "Lexora deterministic workbook generator",
        "/Producer": "Lexora",
        "/CreationDate": "D:20260811000000Z",
        "/ModDate": "D:20260811000000Z",
    })
    with OUTPUT.open("wb") as stream:
        writer.write(stream)
    TEMP.unlink()
    print(OUTPUT)


if __name__ == "__main__":
    main()
