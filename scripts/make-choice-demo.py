"""Generate the synthetic choice-marker demo PDF used in the README.

Run inside the ai-service container (has OpenCV + Pillow):

    docker compose cp scripts/make-choice-demo.py ai-service:/tmp/
    docker compose exec ai-service python /tmp/make-choice-demo.py /tmp/lexora-choice-demo.pdf

Upload the produced PDF through the real application and process page 1
to reproduce the docs/images/lexora-choice-demo.png screenshot.
"""

import sys

import cv2
import numpy as np
from PIL import Image

W, H = 1240, 1754
INK = (35, 35, 40)


def main(output_path: str) -> None:
    image = np.full((H, W, 3), 255, dtype=np.uint8)

    def text(s, x, y, scale, thickness):
        cv2.putText(
            image, s, (x, y), cv2.FONT_HERSHEY_SIMPLEX,
            scale, INK, thickness, cv2.LINE_AA,
        )

    def text_width(s, scale, thickness):
        (width, _), _ = cv2.getTextSize(
            s, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness
        )
        return width

    def ring(cx, cy, r):
        cv2.circle(image, (cx, cy), r, INK, 3, cv2.LINE_AA)

    text("Das Modalverb konnen. Welche Bedeutung passt?", 90, 140, 1.3, 3)
    text("Notieren Sie die Zahl.", 90, 190, 1.3, 3)
    text("1 = Ich habe das gelernt.", 90, 290, 0.95, 2)
    text("2 = Es gibt die Chance / die Moglichkeit.", 90, 350, 0.95, 2)
    text("3 = Es ist nicht verboten.", 90, 410, 0.95, 2)

    rows = [
        "Ich kann gut Ski fahren, aber es gibt hier keinen Schnee.",
        "Konnen Sie Englisch? Dann konnen Sie den Job in England machen.",
        "Konnen Sie nicht lesen? Hier ist Parken verboten.",
        "Ich kann das Auto nicht kaufen. Ich kann es nicht bezahlen.",
        "Er kann gut Schlagzeug spielen. Aber er kann nicht oft spielen.",
    ]
    y = 520
    for row in rows:
        text(row, 90, y, 0.85, 2)
        ring(90 + text_width(row, 0.85, 2) + 55, y - 12, 15)
        y += 110

    Image.fromarray(image).save(output_path)
    print(f"wrote {output_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/lexora-choice-demo.pdf")
