from pathlib import Path

import cv2
import numpy as np
import pytest

from app.document.blank_detection import detect_exercise_blanks
from app.schemas.page_analysis import BBox, PageAnalysis, ProcessorMetadata, TextSpan


WIDTH = 1000
HEIGHT = 600


def _analysis(*spans: tuple[str, float, float, float, float]) -> PageAnalysis:
    return PageAnalysis(
        pageNumber=2,
        width=WIDTH,
        height=HEIGHT,
        language="de",
        textSpans=[
            TextSpan(
                id=span_id,
                text="Wort",
                confidence=0.99,
                confidenceScope="line",
                bbox=BBox(x=x, y=y, width=width, height=height),
            )
            for span_id, x, y, width, height in spans
        ],
        processor=ProcessorMetadata(
            engine="test",
            engineVersion="1",
            model="test",
            language="de",
            durationMs=1,
        ),
    )


def _image(tmp_path: Path, lines=(), noise=()) -> str:
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    for x1, y, x2, thickness in lines:
        cv2.line(image, (x1, y), (x2, y), (0, 0, 0), thickness)
    for x, y, radius in noise:
        cv2.circle(image, (x, y), radius, (0, 0, 0), -1)
    path = tmp_path / "page.png"
    assert cv2.imwrite(str(path), image)
    return str(path)


def _sentence_image(tmp_path: Path, words=(), line=(), extra_lines=()) -> str:
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    for text, org in words:
        cv2.putText(image, text, org, cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    if line:
        cv2.line(image, (line[0], line[1]), (line[2], line[1]), (0, 0, 0), line[3])
    for x1, y, x2, thickness in extra_lines:
        cv2.line(image, (x1, y), (x2, y), (0, 0, 0), thickness)
    path = tmp_path / "sentence.png"
    assert cv2.imwrite(str(path), image)
    return str(path)


def test_detects_valid_line_and_uses_ocr_height(tmp_path):
    path = _image(tmp_path, lines=[(300, 208, 450, 2)])
    analysis = _analysis(("span-a", 0.18, 0.32, 0.09, 0.04))

    result = detect_exercise_blanks(path, analysis)

    assert result.blankDetection is not None
    assert result.blankDetection.acceptedCount == 1
    blank = result.exerciseBlanks[0]
    assert blank.nearbyTextSpanIds == ["span-a"]
    assert blank.interactionBbox.height == pytest.approx(0.04 * 1.25)
    assert 0 <= blank.candidateScore <= 1


def test_detects_multiple_varying_lines_in_reading_order(tmp_path):
    path = _image(
        tmp_path,
        lines=[(600, 400, 850, 3), (300, 150, 380, 1), (100, 400, 200, 2)],
    )
    analysis = _analysis(
        ("top", 0.20, 0.23, 0.08, 0.04),
        ("bottom-left", 0.01, 0.64, 0.07, 0.04),
        ("bottom-right", 0.50, 0.64, 0.07, 0.04),
    )

    result = detect_exercise_blanks(path, analysis)

    assert [blank.id for blank in result.exerciseBlanks] == [
        "blank-2-1",
        "blank-2-2",
        "blank-2-3",
    ]
    positions = [(blank.lineBbox.y, blank.lineBbox.x) for blank in result.exerciseBlanks]
    assert positions == sorted(positions)


def test_rejects_long_rule_noise_and_text_like_marks(tmp_path):
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    cv2.line(image, (50, 200), (950, 200), (0, 0, 0), 2)
    cv2.putText(image, "-----", (300, 300), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    for x in range(100, 900, 100):
        cv2.circle(image, (x, 420), 2, (0, 0, 0), -1)
    path = tmp_path / "reject.png"
    assert cv2.imwrite(str(path), image)
    analysis = _analysis(
        ("a", 0.1, 0.30, 0.1, 0.04),
        ("b", 0.2, 0.47, 0.08, 0.04),
        ("c", 0.2, 0.67, 0.08, 0.04),
    )

    result = detect_exercise_blanks(str(path), analysis)

    assert result.exerciseBlanks == []
    assert result.blankDetection is not None
    assert result.blankDetection.rawCandidateCount >= 1


def test_rejects_line_without_ocr_spatial_evidence(tmp_path):
    path = _image(tmp_path, lines=[(300, 200, 450, 2)])

    result = detect_exercise_blanks(path, _analysis())

    assert result.exerciseBlanks == []
    assert result.blankDetection is not None
    assert result.blankDetection.acceptedCount == 0


def test_rejects_short_image_edge_with_only_one_text_neighbor(tmp_path):
    path = _image(tmp_path, lines=[(800, 200, 835, 2)])
    analysis = _analysis(("left-only", 0.70, 0.32, 0.08, 0.04))

    result = detect_exercise_blanks(path, analysis)

    assert result.exerciseBlanks == []


def test_rejects_horizontal_structure_overlapping_ocr_text(tmp_path):
    path = _image(tmp_path, lines=[(300, 208, 350, 2)])
    analysis = _analysis(("overlap", 0.30, 0.32, 0.05, 0.04))

    result = detect_exercise_blanks(path, analysis)

    assert result.exerciseBlanks == []


def test_rejects_line_inside_colored_image_region(tmp_path):
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (250, 170), (500, 240), (180, 180, 180), -1)
    cv2.line(image, (300, 208), (450, 208), (0, 0, 0), 2)
    path = tmp_path / "image-edge.png"
    assert cv2.imwrite(str(path), image)
    analysis = _analysis(
        ("left", 0.18, 0.32, 0.08, 0.04),
        ("right", 0.47, 0.32, 0.08, 0.04),
    )

    result = detect_exercise_blanks(str(path), analysis)

    assert result.exerciseBlanks == []


def test_no_blanks_image_returns_empty_detection(tmp_path):
    path = _image(tmp_path)
    analysis = _analysis(("span-a", 0.18, 0.32, 0.09, 0.04))

    result = detect_exercise_blanks(path, analysis)

    assert result.exerciseBlanks == []
    assert result.blankDetection is not None
    assert result.blankDetection.rawCandidateCount == 0
    assert result.blankDetection.acceptedCount == 0


def test_edge_candidate_stays_within_normalized_bounds(tmp_path):
    path = _image(tmp_path, lines=[(0, 8, 120, 2)])
    analysis = _analysis(("edge", 0.13, 0.0, 0.06, 0.04))

    blank = detect_exercise_blanks(path, analysis).exerciseBlanks[0]

    for bbox in (blank.lineBbox, blank.interactionBbox):
        assert 0 <= bbox.x <= 1
        assert 0 <= bbox.y <= 1
        assert 0 <= bbox.x + bbox.width <= 1
        assert 0 <= bbox.y + bbox.height <= 1


def test_detection_is_deterministic_except_duration(tmp_path):
    path = _image(tmp_path, lines=[(300, 208, 450, 2)])
    analysis = _analysis(("span-a", 0.18, 0.32, 0.09, 0.04))

    first = detect_exercise_blanks(path, analysis)
    second = detect_exercise_blanks(path, analysis)

    assert first.exerciseBlanks == second.exerciseBlanks
    assert first.blankDetection.rawCandidateCount == second.blankDetection.rawCandidateCount
    assert first.blankDetection.acceptedCount == second.blankDetection.acceptedCount


def test_rejects_dimension_mismatch_without_transforming(tmp_path):
    path = _image(tmp_path, lines=[(300, 208, 450, 2)])
    analysis = _analysis(("span-a", 0.18, 0.32, 0.09, 0.04)).model_copy(
        update={"width": WIDTH - 1}
    )

    with pytest.raises(ValueError, match="dimensions do not match"):
        detect_exercise_blanks(path, analysis)


def test_detects_short_suffix_blank_embedded_in_sentence(tmp_path):
    path = _sentence_image(
        tmp_path,
        words=[("tu", (300, 214)), ("en", (450, 214))],
        line=(390, 206, 445, 2),
    )
    analysis = _analysis(("sentence", 0.20, 0.33, 0.45, 0.04))

    result = detect_exercise_blanks(path, analysis)

    assert len(result.exerciseBlanks) == 1
    blank = result.exerciseBlanks[0]
    assert blank.detectionMethod == "short-suffix-line-v1"
    assert 0 <= blank.lineBbox.x <= 1
    assert 0 <= blank.lineBbox.y + blank.lineBbox.height <= 1


def test_rejects_period_punctuation(tmp_path):
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    cv2.circle(image, (390, 214), 3, (0, 0, 0), -1)
    path = tmp_path / "period.png"
    assert cv2.imwrite(str(path), image)
    analysis = _analysis(("sentence", 0.20, 0.33, 0.45, 0.04))

    result = detect_exercise_blanks(str(path), analysis)

    assert result.exerciseBlanks == []


def test_rejects_short_stroke_with_text_above(tmp_path):
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    cv2.putText(image, "tu", (300, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    cv2.line(image, (390, 180), (440, 180), (0, 0, 0), 2)
    path = tmp_path / "stroke.png"
    assert cv2.imwrite(str(path), image)
    analysis = _analysis(("sentence", 0.20, 0.30, 0.45, 0.04))

    result = detect_exercise_blanks(str(path), analysis)

    assert result.exerciseBlanks == []


def test_rejects_hyphen_without_adjacent_text(tmp_path):
    path = _sentence_image(tmp_path, line=(390, 206, 445, 2))
    analysis = _analysis(("sentence", 0.20, 0.33, 0.45, 0.04))

    result = detect_exercise_blanks(path, analysis)

    assert result.exerciseBlanks == []


def test_rejects_text_occupied_table_line(tmp_path):
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    cv2.putText(image, "Zeile eins", (330, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(image, "Zeile zwei", (330, 226), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.line(image, (300, 208), (600, 208), (0, 0, 0), 2)
    cv2.line(image, (300, 234), (600, 234), (0, 0, 0), 2)
    cv2.line(image, (300, 165), (300, 240), (0, 0, 0), 2)
    cv2.line(image, (600, 165), (600, 240), (0, 0, 0), 2)
    path = tmp_path / "table.png"
    assert cv2.imwrite(str(path), image)
    analysis = _analysis(
        ("row-1", 0.30, 0.29, 0.25, 0.04),
        ("row-2", 0.30, 0.34, 0.25, 0.04),
    )

    result = detect_exercise_blanks(str(path), analysis)

    assert result.exerciseBlanks == []


def test_valid_non_table_blank_remains_accepted(tmp_path):
    path = _sentence_image(
        tmp_path,
        words=[("Wort", (280, 214)), ("Ende", (520, 214))],
        line=(400, 206, 520, 2),
    )
    analysis = _analysis(
        ("left", 0.26, 0.33, 0.12, 0.04),
        ("right", 0.52, 0.33, 0.10, 0.04),
    )

    result = detect_exercise_blanks(path, analysis)

    assert len(result.exerciseBlanks) == 1
    assert result.exerciseBlanks[0].detectionMethod == "horizontal-line-v1"


def test_short_suffix_detection_is_deterministic(tmp_path):
    path = _sentence_image(
        tmp_path,
        words=[("tu", (300, 214)), ("en", (450, 214))],
        line=(390, 206, 445, 2),
    )
    analysis = _analysis(("sentence", 0.20, 0.33, 0.45, 0.04))

    first = detect_exercise_blanks(path, analysis)
    second = detect_exercise_blanks(path, analysis)

    assert first.exerciseBlanks == second.exerciseBlanks
