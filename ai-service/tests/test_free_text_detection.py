from pathlib import Path

import cv2
import numpy as np
import pytest

from app.document.free_text_detection import detect_free_texts
from app.document.interaction_detection import detect_interactions
from app.schemas.page_analysis import (
    BBox,
    ExerciseBlank,
    PageAnalysis,
    ProcessorMetadata,
    TextSpan,
)


WIDTH = 2284
HEIGHT = 3121

# Canonical synthetic writing area:
# a prompt line above a stack of long empty writing lines.
PROMPT_Y = 0.14
STACK_X0 = 0.15
STACK_X1 = 0.85
LINE_YS = [0.30, 0.3225, 0.345]


def _analysis(*spans: tuple) -> PageAnalysis:
    return PageAnalysis(
        pageNumber=7,
        width=WIDTH,
        height=HEIGHT,
        language="de",
        textSpans=[
            TextSpan(
                id=span_id,
                text=text,
                confidence=confidence,
                confidenceScope="line",
                bbox=BBox(x=x, y=y, width=width, height=height),
            )
            for span_id, text, confidence, x, y, width, height in spans
        ],
        processor=ProcessorMetadata(
            engine="test",
            engineVersion="1",
            model="test",
            language="de",
            durationMs=1,
        ),
    )


def _span(
    span_id: str,
    text: str,
    x: float,
    y: float,
    width: float,
    height: float = 0.015,
    confidence: float = 0.99,
):
    return (span_id, text, confidence, x, y, width, height)


def _prompt_span(span_id: str = "span-prompt", text: str = "Write a synthetic response"):
    return _span(span_id, text, STACK_X0 + 0.02, PROMPT_Y, 0.30)


def _image(
    tmp_path: Path,
    lines: list[tuple[float, float, float, float]] | None = None,
    verticals: list[tuple[float, float, float]] | None = None,
    extra_ink: list[tuple[float, float, float, float]] | None = None,
    line_thickness: int = 4,
) -> str:
    """White page with long horizontal lines (and optional ink).

    lines: (x0_norm, y_norm, x1_norm, y_norm) segments.
    verticals: (x_norm, y0_norm, height_norm) vertical segments.
    extra_ink: (x0, y0, x1, y1) normalized segments for glyph-like ink.
    """
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    for x0, y0, x1, y1 in lines or []:
        cv2.line(
            image,
            (round(x0 * WIDTH), round(y0 * HEIGHT)),
            (round(x1 * WIDTH), round(y1 * HEIGHT)),
            (0, 0, 0),
            line_thickness,
        )
    for x, y0, h in verticals or []:
        cv2.line(
            image,
            (round(x * WIDTH), round(y0 * HEIGHT)),
            (round(x * WIDTH), round((y0 + h) * HEIGHT)),
            (0, 0, 0),
            4,
        )
    for x0, y0, x1, y1 in extra_ink or []:
        cv2.line(
            image,
            (round(x0 * WIDTH), round(y0 * HEIGHT)),
            (round(x1 * WIDTH), round(y1 * HEIGHT)),
            (0, 0, 0),
            3,
        )
    path = tmp_path / "page.png"
    assert cv2.imwrite(str(path), image)
    return str(path)


def _stack_lines(
    ys: list[float] = LINE_YS,
    x0: float = STACK_X0,
    x1: float = STACK_X1,
) -> list[tuple[float, float, float, float]]:
    return [(x0, y, x1, y) for y in ys]


def _detect(
    tmp_path: Path,
    analysis: PageAnalysis,
    lines: list[tuple[float, float, float, float]],
    **kwargs,
) -> PageAnalysis:
    path = _image(tmp_path, lines=lines, **kwargs)
    return detect_free_texts(path, analysis)


# ---------------------------------------------------------------- POSITIVE

def test_single_writing_line_with_prompt(tmp_path):
    analysis = _analysis(_prompt_span())
    result = _detect(tmp_path, analysis, [(STACK_X0, 0.30, STACK_X1, 0.30)])

    assert result.freeTextDetection.acceptedCount == 1
    interaction = result.freeTextInteractions[0]
    assert interaction.kind == "free-text"
    assert interaction.detectionMethod == "free-text-v1"
    assert interaction.id == "free-text-7-1"
    assert len(interaction.responseLines) == 1
    line = interaction.responseLines[0]
    assert line.id == "free-text-7-1-line-1"
    assert line.bbox.x == pytest.approx(STACK_X0, abs=0.01)
    assert line.bbox.width == pytest.approx(STACK_X1 - STACK_X0, abs=0.02)
    assert interaction.nearbyTextSpanIds == ["span-prompt"]
    assert interaction.candidateScore >= 0.55


def test_two_response_lines_with_prompt(tmp_path):
    analysis = _analysis(_prompt_span())
    result = _detect(tmp_path, analysis, _stack_lines([0.30, 0.3225]))

    assert result.freeTextDetection.acceptedCount == 1
    interaction = result.freeTextInteractions[0]
    assert len(interaction.responseLines) == 2
    assert interaction.bbox.y == pytest.approx(0.30, abs=0.01)
    assert interaction.bbox.y + interaction.bbox.height == pytest.approx(0.3238, abs=0.01)


def test_multi_line_answer_area_without_prompt(tmp_path):
    """Three clean parallel lines are self-evident writing rows."""
    analysis = _analysis()
    result = _detect(tmp_path, analysis, _stack_lines([0.30, 0.3225, 0.345]))

    assert result.freeTextDetection.acceptedCount == 1
    interaction = result.freeTextInteractions[0]
    assert len(interaction.responseLines) == 3
    assert interaction.nearbyTextSpanIds == []


def test_prompt_and_writing_region(tmp_path):
    """Prompt spans directly above the stack are attached as nearby text."""
    analysis = _analysis(
        _prompt_span("span-a"),
        _span("span-b", "Synthetic example", 0.20, PROMPT_Y + 0.025, 0.10, 0.010, 0.87),
    )
    result = _detect(tmp_path, analysis, _stack_lines([0.30, 0.3225]))

    assert result.freeTextDetection.acceptedCount == 1
    interaction = result.freeTextInteractions[0]
    assert set(interaction.nearbyTextSpanIds) == {"span-a", "span-b"}


def test_repeated_exercise_rows_produce_separate_interactions(tmp_path):
    """Two stacked exercise areas on one page stay independent."""
    analysis = _analysis(
        _prompt_span("span-p1", "Write synthetic response one"),
        _prompt_span("span-p2", "Write synthetic response two"),
    )
    top = _stack_lines([0.30, 0.3225, 0.345])
    bottom = [(STACK_X0, y, STACK_X1, y) for y in [0.55, 0.5725, 0.595]]
    result = _detect(tmp_path, analysis, top + bottom)

    assert result.freeTextDetection.acceptedCount == 2
    assert [i.id for i in result.freeTextInteractions] == ["free-text-7-1", "free-text-7-2"]
    assert result.freeTextInteractions[0].bbox.y < result.freeTextInteractions[1].bbox.y
    assert all(len(i.responseLines) == 3 for i in result.freeTextInteractions)


def test_side_by_side_columns_are_separate_interactions(tmp_path):
    analysis = _analysis(
        _span("span-l", "Synthetic left prompt", 0.12, PROMPT_Y, 0.15),
        _span("span-r", "Synthetic right prompt", 0.60, PROMPT_Y, 0.15),
    )
    left = [(0.12, y, 0.44, y) for y in [0.30, 0.3225]]
    right = [(0.60, y, 0.92, y) for y in [0.30, 0.3225]]
    result = _detect(tmp_path, analysis, left + right)

    assert result.freeTextDetection.acceptedCount == 2
    ids = {i.id for i in result.freeTextInteractions}
    assert ids == {"free-text-7-1", "free-text-7-2"}
    assert all(len(i.responseLines) == 2 for i in result.freeTextInteractions)


def test_slight_geometric_noise_keeps_one_stack(tmp_path):
    """Sub-pixel jitter of parallel lines must not split the stack."""
    lines = [(STACK_X0, 0.300, STACK_X1, 0.300),
             (STACK_X0 + 0.002, 0.323, STACK_X1 - 0.001, 0.323),
             (STACK_X0, 0.345, STACK_X1, 0.345)]
    analysis = _analysis()
    result = _detect(tmp_path, analysis, lines)

    assert result.freeTextDetection.acceptedCount == 1
    assert len(result.freeTextInteractions[0].responseLines) == 3


def test_ocr_text_near_the_answer_area_is_kept_out_of_the_stack(tmp_path):
    """A span below the stack does not become prompt evidence and does not
    break anything."""
    analysis = _analysis(
        _prompt_span(),
        _span("span-note", "Synthetic note", STACK_X0, 0.40, 0.12),
    )
    result = _detect(tmp_path, analysis, _stack_lines([0.30, 0.3225, 0.345]))

    assert result.freeTextDetection.acceptedCount == 1
    assert result.freeTextInteractions[0].nearbyTextSpanIds == ["span-prompt"]


def test_deterministic_ids_and_fingerprints(tmp_path):
    analysis = _analysis(_prompt_span())
    first = _detect(tmp_path, analysis, _stack_lines([0.30, 0.3225, 0.345]))
    second = _detect(tmp_path, analysis, _stack_lines([0.30, 0.3225, 0.345]))

    assert first.freeTextInteractions[0].id == second.freeTextInteractions[0].id
    assert [l.id for l in first.freeTextInteractions[0].responseLines] == [
        l.id for l in second.freeTextInteractions[0].responseLines
    ]
    assert first.freeTextInteractions[0].bbox == second.freeTextInteractions[0].bbox
    assert first.freeTextInteractions[0].candidateScore == second.freeTextInteractions[0].candidateScore


# ---------------------------------------------------------------- NEGATIVE

def test_paragraph_underline_is_rejected(tmp_path):
    """Text ink directly above the line means it is an underline."""
    analysis = _analysis(_prompt_span())
    extra_ink = [(STACK_X0, 0.296, STACK_X1 * 0.8, 0.296)]
    result = _detect(tmp_path, analysis, _stack_lines([0.30]), extra_ink=extra_ink)

    assert result.freeTextDetection.acceptedCount == 0


def test_heading_separator_line_is_rejected(tmp_path):
    """A lone rule without a prompt is not an answer area."""
    analysis = _analysis()
    result = _detect(tmp_path, analysis, [(STACK_X0, 0.30, STACK_X1, 0.30)])

    assert result.freeTextDetection.acceptedCount == 0


def test_decorative_double_rule_is_rejected(tmp_path):
    """Two parallel lines without a prompt are a decorative rule, not a stack."""
    analysis = _analysis()
    result = _detect(tmp_path, analysis, _stack_lines([0.30, 0.326]))

    assert result.freeTextDetection.acceptedCount == 0


def test_page_footer_line_is_rejected(tmp_path):
    analysis = _analysis()
    result = _detect(tmp_path, analysis, [(STACK_X0, 0.95, STACK_X1, 0.95)])

    assert result.freeTextDetection.acceptedCount == 0


def test_table_border_lines_are_rejected(tmp_path):
    """Vertical borders crossing the line mean it is a table row."""
    analysis = _analysis(_prompt_span())
    lines = _stack_lines([0.30, 0.3225, 0.345])
    verticals = [(STACK_X0, 0.25, 0.20), (STACK_X1, 0.25, 0.20)]
    result = _detect(tmp_path, analysis, lines, verticals=verticals)

    assert result.freeTextDetection.acceptedCount == 0


def test_table_rows_with_text_between_lines_are_rejected(tmp_path):
    """Ink between the lines means text rows, not a writing area."""
    analysis = _analysis(_prompt_span())
    lines = _stack_lines([0.30, 0.3225, 0.345])
    extra_ink = [
        (STACK_X0 + 0.02, 0.304, STACK_X1 - 0.02, 0.304),
        (STACK_X0 + 0.02, 0.3265, STACK_X1 - 0.02, 0.3265),
        (STACK_X0 + 0.02, 0.3485, STACK_X1 - 0.02, 0.3485),
    ]
    result = _detect(tmp_path, analysis, lines, extra_ink=extra_ink)

    assert result.freeTextDetection.acceptedCount == 0


def test_fill_blank_short_inline_blanks_are_rejected(tmp_path):
    """Short sentence blanks stay with the FillBlank detector."""
    analysis = _analysis(_prompt_span())
    short = [(0.20, y, 0.30, y) for y in [0.30, 0.3225, 0.345]]
    result = _detect(tmp_path, analysis, short)

    assert result.freeTextDetection.acceptedCount == 0


def test_fill_blank_long_line_with_row_text_is_rejected(tmp_path):
    """A long line whose row also carries sentence text is a blank, not
    a writing line."""
    analysis = _analysis()
    lines = [(STACK_X0, 0.30, STACK_X1, 0.30)]
    extra_ink = [(0.16, 0.30, 0.28, 0.30), (0.72, 0.30, 0.84, 0.30)]
    result = _detect(tmp_path, analysis, lines, extra_ink=extra_ink)

    assert result.freeTextDetection.acceptedCount == 0


def test_choice_grid_rows_are_rejected(tmp_path):
    """Grid rows have ink above/below each line and vertical borders."""
    analysis = _analysis(_prompt_span())
    lines = [(STACK_X0, y, STACK_X1, y) for y in [0.30, 0.3225, 0.345]]
    verticals = [(0.25, 0.28, 0.14), (0.50, 0.28, 0.14), (0.75, 0.28, 0.14)]
    extra_ink = [(STACK_X0 + 0.02, 0.318, STACK_X1 - 0.02, 0.318)]
    result = _detect(tmp_path, analysis, lines, verticals=verticals, extra_ink=extra_ink)

    assert result.freeTextDetection.acceptedCount == 0


def test_sentence_ordering_rows_are_rejected(tmp_path):
    """Ordering fragment rows carry text on the row band."""
    analysis = _analysis()
    lines = [(STACK_X0, 0.30, STACK_X1, 0.30)]
    extra_ink = [(0.17, 0.30, 0.40, 0.30), (0.42, 0.30, 0.62, 0.30), (0.64, 0.30, 0.83, 0.30)]
    result = _detect(tmp_path, analysis, lines, extra_ink=extra_ink)

    assert result.freeTextDetection.acceptedCount == 0


def test_arbitrary_whitespace_is_rejected(tmp_path):
    analysis = _analysis(_prompt_span())
    result = _detect(tmp_path, analysis, [])

    assert result.freeTextDetection.acceptedCount == 0
    assert result.freeTextInteractions == []


def test_text_without_an_answer_area_is_rejected(tmp_path):
    analysis = _analysis(
        _span("span-a", "Synthetic paragraph line one.", 0.12, 0.20, 0.30),
        _span("span-b", "Synthetic paragraph line two.", 0.12, 0.24, 0.30),
        _span("span-c", "Synthetic paragraph line three.", 0.12, 0.28, 0.30),
    )
    result = _detect(tmp_path, analysis, [])

    assert result.freeTextDetection.acceptedCount == 0


def test_matching_anchor_dots_produce_no_free_text(tmp_path):
    analysis = _analysis(_prompt_span())
    dots = [(0.49, y, 0.49, y) for y in [0.30, 0.3225, 0.345]]
    result = _detect(tmp_path, analysis, [], extra_ink=dots)

    assert result.freeTextDetection.acceptedCount == 0


# ---------------------------------------------------------------- BOUNDARY

def test_minimum_width_boundary(tmp_path):
    analysis = _analysis(_prompt_span())
    accepted = _detect(
        tmp_path, analysis, [(STACK_X0, 0.30, STACK_X0 + 0.30, 0.30)]
    )
    assert accepted.freeTextDetection.acceptedCount == 1
    rejected = _detect(
        tmp_path, analysis, [(STACK_X0, 0.30, STACK_X0 + 0.29, 0.30)]
    )
    assert rejected.freeTextDetection.acceptedCount == 0


def test_excessive_thickness_is_rejected(tmp_path):
    analysis = _analysis(_prompt_span())
    result = _detect(
        tmp_path, analysis, [(STACK_X0, 0.30, STACK_X1, 0.30)], line_thickness=40
    )
    assert result.freeTextDetection.acceptedCount == 0


def test_wide_stack_gap_splits_into_single_lines(tmp_path):
    """Lines 0.03 apart are separate rows; without a prompt or a stack
    they are rejected."""
    analysis = _analysis()
    result = _detect(tmp_path, analysis, _stack_lines([0.30, 0.326]))

    assert result.freeTextDetection.acceptedCount == 0


def _detect_with_spans(tmp_path, analysis, lines, spans):
    analysis = _analysis(*spans)
    return _detect(tmp_path, analysis, lines)


def test_prompt_too_far_above_single_line_is_rejected(tmp_path):
    far_prompt = _span("span-far", "Synthetic distant prompt", STACK_X0 + 0.02, 0.05, 0.30)
    result = _detect_with_spans(
        tmp_path, _analysis(), [(STACK_X0, 0.42, STACK_X1, 0.42)], [far_prompt]
    )

    assert result.freeTextDetection.acceptedCount == 0


def test_prompt_too_far_above_three_lines_is_still_accepted(tmp_path):
    """Line evidence alone carries a 3-line stack regardless of prompt."""
    analysis = _analysis(_prompt_span())
    far_prompt = _span("span-far", "Synthetic distant prompt", STACK_X0 + 0.02, 0.05, 0.30)
    result = _detect_with_spans(
        tmp_path, analysis, _stack_lines([0.42, 0.4425, 0.465]), [far_prompt]
    )

    assert result.freeTextDetection.acceptedCount == 1
    assert result.freeTextInteractions[0].nearbyTextSpanIds == []


def test_low_confidence_prompt_span_is_ignored(tmp_path):
    analysis = _analysis(_span("span-low", "synthetic prompt", STACK_X0 + 0.02, PROMPT_Y, 0.20, confidence=0.35))
    result = _detect(tmp_path, analysis, [(STACK_X0, 0.30, STACK_X1, 0.30)])

    assert result.freeTextDetection.acceptedCount == 0


def test_dimension_mismatch_raises(tmp_path):
    path = _image(tmp_path, lines=_stack_lines())
    analysis = _analysis(_prompt_span())
    wrong = analysis.model_copy(update={"width": 999})
    with pytest.raises(ValueError):
        detect_free_texts(path, wrong)


def test_missing_image_raises(tmp_path):
    analysis = _analysis(_prompt_span())
    with pytest.raises(ValueError):
        detect_free_texts(str(tmp_path / "missing.png"), analysis)


def test_gray_and_bgra_images_are_supported(tmp_path):
    analysis = _analysis(_prompt_span())
    gray = np.full((HEIGHT, WIDTH), 255, dtype=np.uint8)
    for y in [0.30, 0.3225, 0.345]:
        cv2.line(gray, (round(STACK_X0 * WIDTH), round(y * HEIGHT)),
                 (round(STACK_X1 * WIDTH), round(y * HEIGHT)), 0, 4)
    gray_path = tmp_path / "gray.png"
    assert cv2.imwrite(str(gray_path), gray)
    result = detect_free_texts(str(gray_path), analysis)
    assert result.freeTextDetection.acceptedCount == 1

    bgra = np.full((HEIGHT, WIDTH, 4), 255, dtype=np.uint8)
    for y in [0.30, 0.3225, 0.345]:
        cv2.line(bgra, (round(STACK_X0 * WIDTH), round(y * HEIGHT)),
                 (round(STACK_X1 * WIDTH), round(y * HEIGHT)), (0, 0, 0, 255), 4)
    bgra_path = tmp_path / "bgra.png"
    assert cv2.imwrite(str(bgra_path), bgra)
    result = detect_free_texts(str(bgra_path), analysis)
    assert result.freeTextDetection.acceptedCount == 1


# ---------------------------------------------------------------- COEXISTENCE

def test_fill_blank_lines_claimed_by_free_text_are_suppressed(tmp_path):
    """A long isolated writing line that would also be a FillBlank line is
    removed from exerciseBlanks once FreeText claims it."""
    analysis = _analysis(_prompt_span())
    lines = _stack_lines([0.30, 0.3225, 0.345])
    path = _image(tmp_path, lines=lines)
    with_blanks = detect_interactions(path, analysis)

    assert with_blanks.freeTextDetection.acceptedCount == 1
    assert len(with_blanks.freeTextInteractions[0].responseLines) == 3
    claimed = with_blanks.freeTextInteractions[0].responseLines
    for line in claimed:
        assert not any(
            blank.lineBbox.x == pytest.approx(line.bbox.x, abs=0.01)
            and blank.lineBbox.y == pytest.approx(line.bbox.y, abs=0.01)
            for blank in with_blanks.exerciseBlanks
        )


def test_fill_blank_rows_stay_when_free_text_claims_only_its_stack(tmp_path):
    """Short sentence blanks elsewhere on the page are untouched."""
    analysis = _analysis(_prompt_span())
    lines = _stack_lines([0.30, 0.3225, 0.345])
    short_blanks = [(0.20, y, 0.28, y) for y in [0.55, 0.58]]
    path = _image(tmp_path, lines=lines + short_blanks)
    result = detect_interactions(path, analysis)

    assert result.freeTextDetection.acceptedCount == 1
    assert len(result.freeTextInteractions[0].responseLines) == 3
    # No blank may sit inside the FreeText writing area.
    assert all(
        not (0.29 <= blank.lineBbox.y <= 0.39) for blank in result.exerciseBlanks
    )


def test_blank_suppression_only_matches_the_same_line(tmp_path):
    """A nearly-identical line bbox is required for suppression; a different
    nearby line is kept."""
    analysis = _analysis(_prompt_span())
    path = _image(tmp_path, lines=_stack_lines([0.30, 0.3225, 0.345]))
    blank = ExerciseBlank(
        id="blank-7-1",
        lineBbox=BBox(x=STACK_X0, y=0.52, width=STACK_X1 - STACK_X0, height=0.0013),
        interactionBbox=BBox(x=STACK_X0, y=0.51, width=STACK_X1 - STACK_X0, height=0.02),
        candidateScore=0.8,
        nearbyTextSpanIds=[],
    )
    result = detect_free_texts(path, analysis.model_copy(update={"exerciseBlanks": [blank]}))

    assert result.freeTextDetection.acceptedCount == 1
    assert len(result.exerciseBlanks) == 1
    assert result.exerciseBlanks[0].id == "blank-7-1"
