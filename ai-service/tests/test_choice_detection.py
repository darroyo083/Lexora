from pathlib import Path

import cv2
import numpy as np
import pytest

from app.document.choice_detection import detect_choice_interactions
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


def _image(
    tmp_path: Path,
    rings=(),
    discs=(),
    dots=(),
    noise=0,
    legend_text=(),
) -> str:
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    for cx, cy, radius in rings:
        cv2.circle(image, (cx, cy), radius, (0, 0, 0), 2)
    for cx, cy, radius in discs:
        cv2.circle(image, (cx, cy), radius, (0, 0, 0), -1)
    for cx, cy, radius in dots:
        cv2.circle(image, (cx, cy), radius, (0, 0, 0), -1)
    if noise:
        rng = np.random.default_rng(42)
        mask = rng.random((HEIGHT, WIDTH)) < noise
        image[mask] = 0
    for text, org in legend_text:
        cv2.putText(image, text, org, cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    path = tmp_path / "page.png"
    assert cv2.imwrite(str(path), image)
    return str(path)


def _ring_row_analysis(row_y: float = 0.33) -> PageAnalysis:
    return _analysis(("span-a", 0.15, row_y, 0.30, 0.033))


def test_detects_single_empty_circle_target(tmp_path):
    path = _image(tmp_path, rings=[(300, 200, 13)])
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert result.choiceDetection is not None
    assert result.choiceDetection.acceptedCount == 1
    target = result.choiceTargets[0]
    assert target.id == "choice-2-1"
    assert target.kind == "choice"
    assert target.detectionMethod == "empty-ring-v1"
    assert target.nearbyTextSpanIds == ["span-a"]
    assert 0 <= target.candidateScore <= 1
    assert target.targetBbox.width == pytest.approx(28 / WIDTH, abs=0.004)
    assert target.interactionBbox.width > target.targetBbox.width
    assert target.optionGroupId is None


def test_detects_repeated_vertically_aligned_targets(tmp_path):
    path = _image(tmp_path, rings=[(300, 150, 13), (300, 250, 13), (300, 350, 13)])
    analysis = _analysis(
        ("row-1", 0.15, 0.23, 0.30, 0.033),
        ("row-2", 0.15, 0.40, 0.30, 0.033),
        ("row-3", 0.15, 0.57, 0.30, 0.033),
    )

    result = detect_choice_interactions(path, analysis)

    assert [t.id for t in result.choiceTargets] == [
        "choice-2-1",
        "choice-2-2",
        "choice-2-3",
    ]
    positions = [(t.targetBbox.y, t.targetBbox.x) for t in result.choiceTargets]
    assert positions == sorted(positions)


def test_detects_multiple_target_columns_in_reading_order(tmp_path):
    path = _image(tmp_path, rings=[(600, 200, 13), (300, 200, 13)])
    analysis = _analysis(
        ("span-a", 0.15, 0.33, 0.30, 0.033),
        ("span-b", 0.55, 0.33, 0.30, 0.033),
    )

    result = detect_choice_interactions(path, analysis)

    assert [t.targetBbox.x for t in result.choiceTargets] == [
        pytest.approx(0.286, abs=0.01),
        pytest.approx(0.586, abs=0.01),
    ]


def test_rejects_bullet_dots_and_tiny_rings(tmp_path):
    path = _image(
        tmp_path,
        dots=[(300, 200, 2), (340, 200, 3), (380, 200, 2)],
        rings=[(430, 200, 4)],
    )
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert result.choiceTargets == []
    assert result.choiceDetection.rawCandidateCount == 0


def test_rejects_glyph_hole_smaller_than_text(tmp_path):
    path = _image(tmp_path, rings=[(300, 200, 7)])
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert result.choiceTargets == []


def test_rejects_digit_zero_like_narrow_hole(tmp_path):
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    cv2.ellipse(image, (300, 200), (10, 18), 0, 0, 360, (0, 0, 0), 2)
    path = tmp_path / "zero.png"
    assert cv2.imwrite(str(path), image)
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(str(path), analysis)

    assert result.choiceTargets == []


def test_rejects_umlaut_dots(tmp_path):
    path = _image(tmp_path, dots=[(300, 180, 2), (330, 180, 2)])
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert result.choiceTargets == []


def test_rejects_filled_circle(tmp_path):
    path = _image(tmp_path, discs=[(300, 200, 13)])
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert result.choiceTargets == []


def test_rejects_circle_containing_ink(tmp_path):
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    cv2.circle(image, (300, 200), 13, (0, 0, 0), 2)
    cv2.rectangle(image, (295, 195), (305, 205), (0, 0, 0), -1)
    path = tmp_path / "p-sign.png"
    assert cv2.imwrite(str(path), image)
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(str(path), analysis)

    assert result.choiceTargets == []


def test_accepts_ring_under_noisy_scan_background(tmp_path):
    path = _image(tmp_path, rings=[(300, 200, 13)], noise=0.004)
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert len(result.choiceTargets) == 1


def test_target_near_page_edge_stays_in_normalized_bounds(tmp_path):
    path = _image(tmp_path, rings=[(20, 200, 13)])
    analysis = _analysis(("span-a", 0.02, 0.33, 0.30, 0.033))

    target = detect_choice_interactions(path, analysis).choiceTargets[0]

    for bbox in (target.targetBbox, target.interactionBbox):
        assert 0 <= bbox.x <= 1
        assert 0 <= bbox.y <= 1
        assert 0 <= bbox.x + bbox.width <= 1
        assert 0 <= bbox.y + bbox.height <= 1


def test_rejects_target_without_ocr_context(tmp_path):
    path = _image(tmp_path, rings=[(300, 200, 13)])

    result = detect_choice_interactions(path, _analysis())

    assert result.choiceTargets == []
    assert result.choiceDetection.acceptedCount == 0


def test_no_targets_returns_empty_detection(tmp_path):
    path = _image(tmp_path)
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert result.choiceTargets == []
    assert result.choiceGroups == []
    assert result.choiceDetection is not None
    assert result.choiceDetection.rawCandidateCount == 0
    assert result.choiceDetection.acceptedCount == 0
    assert result.choiceDetection.groupCount == 0


def test_detection_is_deterministic_except_duration(tmp_path):
    path = _image(tmp_path, rings=[(300, 150, 13), (500, 250, 12)])
    analysis = _analysis(
        ("row-1", 0.15, 0.23, 0.30, 0.033),
        ("row-2", 0.15, 0.40, 0.30, 0.033),
    )

    first = detect_choice_interactions(path, analysis)
    second = detect_choice_interactions(path, analysis)

    assert first.choiceTargets == second.choiceTargets
    assert first.choiceGroups == second.choiceGroups
    assert (
        first.choiceDetection.rawCandidateCount
        == second.choiceDetection.rawCandidateCount
    )
    assert first.choiceDetection.acceptedCount == second.choiceDetection.acceptedCount


def test_rejects_dimension_mismatch_without_transforming(tmp_path):
    path = _image(tmp_path, rings=[(300, 200, 13)])
    analysis = _ring_row_analysis().model_copy(update={"width": WIDTH - 1})

    with pytest.raises(ValueError, match="dimensions do not match"):
        detect_choice_interactions(path, analysis)


def test_extracts_option_group_from_numbered_legend(tmp_path):
    path = _image(
        tmp_path,
        rings=[(300, 240, 13), (500, 240, 13)],
        legend_text=[("1 = Ich habe das gelernt.", (140, 175))],
    )
    analysis = _analysis(
        ("legend-1", 0.14, 0.25, 0.30, 0.033),
        ("legend-2", 0.14, 0.283, 0.30, 0.033),
        ("legend-3", 0.14, 0.316, 0.30, 0.033),
        ("row-a", 0.15, 0.40, 0.30, 0.033),
        ("row-b", 0.45, 0.40, 0.30, 0.033),
    )
    analysis = analysis.model_copy(
        update={
            "textSpans": [
                TextSpan(
                    id="legend-1",
                    text="1 = Ich habe das gelernt.",
                    confidence=0.99,
                    confidenceScope="line",
                    bbox=BBox(x=0.14, y=0.25, width=0.30, height=0.033),
                ),
                TextSpan(
                    id="legend-2",
                    text="2 = Es gibt die Chance.",
                    confidence=0.99,
                    confidenceScope="line",
                    bbox=BBox(x=0.14, y=0.283, width=0.30, height=0.033),
                ),
                TextSpan(
                    id="legend-3",
                    text="3 = Es ist nicht verboten.",
                    confidence=0.99,
                    confidenceScope="line",
                    bbox=BBox(x=0.14, y=0.316, width=0.30, height=0.033),
                ),
                TextSpan(
                    id="row-a",
                    text="Satz eins.",
                    confidence=0.99,
                    confidenceScope="line",
                    bbox=BBox(x=0.15, y=0.40, width=0.30, height=0.033),
                ),
                TextSpan(
                    id="row-b",
                    text="Satz zwei.",
                    confidence=0.99,
                    confidenceScope="line",
                    bbox=BBox(x=0.45, y=0.40, width=0.30, height=0.033),
                ),
            ]
        }
    )

    result = detect_choice_interactions(path, analysis)

    assert len(result.choiceGroups) == 1
    group = result.choiceGroups[0]
    assert group.id == "choice-group-2-1"
    assert [option.label for option in group.options] == ["1", "2", "3"]
    assert all(target.optionGroupId == group.id for target in result.choiceTargets)


def test_keeps_targets_without_option_group_when_legend_is_missing(tmp_path):
    path = _image(tmp_path, rings=[(300, 200, 13)])
    analysis = _ring_row_analysis()

    result = detect_choice_interactions(path, analysis)

    assert result.choiceGroups == []
    assert len(result.choiceTargets) == 1
    assert result.choiceTargets[0].optionGroupId is None
    assert result.choiceDetection.groupCount == 0
