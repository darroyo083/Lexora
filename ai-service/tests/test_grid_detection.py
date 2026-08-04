from pathlib import Path

import cv2
import numpy as np
import pytest

from app.document.grid_detection import detect_choice_grids
from app.schemas.page_analysis import BBox, PageAnalysis, ProcessorMetadata, TextSpan


WIDTH = 1000
HEIGHT = 600


def _analysis(*spans: tuple[str, str, float, float, float, float]) -> PageAnalysis:
    return PageAnalysis(
        pageNumber=2,
        width=WIDTH,
        height=HEIGHT,
        language="de",
        textSpans=[
            TextSpan(
                id=span_id,
                text=text,
                confidence=0.99,
                confidenceScope="line",
                bbox=BBox(x=x, y=y, width=width, height=height),
            )
            for span_id, text, x, y, width, height in spans
        ],
        processor=ProcessorMetadata(
            engine="test",
            engineVersion="1",
            model="test",
            language="de",
            durationMs=1,
        ),
    )


def _grid_image(
    tmp_path: Path,
    rules=(144, 168, 192, 216, 240, 264),
    verticals=(600, 700, 800),
    v_bottom=324,
    extra=(),
) -> str:
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    for y in rules:
        cv2.line(image, (150, y), (900, y), (0, 0, 0), 2)
    for vx in verticals:
        cv2.line(image, (vx, rules[0]), (vx, v_bottom), (0, 0, 0), 2)
    for fn in extra:
        fn(image)
    path = tmp_path / "grid.png"
    assert cv2.imwrite(str(path), image)
    return str(path)


def _three_column_analysis() -> PageAnalysis:
    return _analysis(
        ("label-1", "ja", 0.60, 0.20, 0.05, 0.02),
        ("label-2", "nein", 0.72, 0.20, 0.06, 0.02),
        ("label-3", "doch", 0.82, 0.20, 0.06, 0.02),
        ("row-1", "Satz eins.", 0.10, 0.25, 0.30, 0.02),
        ("row-2", "Satz zwei.", 0.10, 0.29, 0.30, 0.02),
        ("row-3", "Satz drei.", 0.10, 0.33, 0.30, 0.02),
        ("row-4", "Satz vier.", 0.10, 0.37, 0.30, 0.02),
    )


def test_detects_simple_choice_grid(tmp_path):
    path = _grid_image(tmp_path)

    result = detect_choice_grids(path, _three_column_analysis())

    assert result.choiceGridDetection is not None
    assert result.choiceGridDetection.acceptedCount == 1
    grid = result.choiceGrids[0]
    assert grid.id == "choice-grid-2-1"
    assert grid.kind == "choice-grid"
    assert grid.detectionMethod == "table-grid-v1"
    assert 0 <= grid.candidateScore <= 1
    assert len(grid.rows) == 4
    assert [row.id for row in grid.rows] == [
        "choice-grid-2-1-row-1",
        "choice-grid-2-1-row-2",
        "choice-grid-2-1-row-3",
        "choice-grid-2-1-row-4",
    ]
    group = result.choiceGroups[0]
    assert group.id == "grid-group-2-1"
    assert [option.label for option in group.options] == ["ja", "nein", "doch"]
    row = grid.rows[0]
    assert len(row.cells) == 3
    assert row.cells[0].optionId == "grid-group-2-1-ja"
    assert row.cells[1].optionId == "grid-group-2-1-nein"
    assert row.cells[2].optionId == "grid-group-2-1-doch"
    assert row.nearbyTextSpanIds == ["row-1"]
    for cell in row.cells:
        b = cell.cellBbox
        assert 0 <= b.x <= 1 and 0 <= b.y <= 1
        assert 0 <= b.x + b.width <= 1 and 0 <= b.y + b.height <= 1


def test_detects_two_column_grid(tmp_path):
    path = _grid_image(
        tmp_path, rules=(144, 168, 192, 216), verticals=(600, 750), v_bottom=276
    )
    analysis = _analysis(
        ("label-1", "yes", 0.62, 0.20, 0.05, 0.02),
        ("label-2", "no", 0.77, 0.20, 0.05, 0.02),
        ("row-1", "Satz eins.", 0.10, 0.25, 0.30, 0.02),
        ("row-2", "Satz zwei.", 0.10, 0.29, 0.30, 0.02),
        ("row-3", "Satz drei.", 0.10, 0.33, 0.30, 0.02),
    )

    result = detect_choice_grids(str(path), analysis)

    assert len(result.choiceGrids) == 1
    grid = result.choiceGrids[0]
    assert len(grid.rows) == 3
    assert [o.label for o in result.choiceGroups[0].options] == ["yes", "no"]


def test_rejects_static_table_with_text_in_cells(tmp_path):
    def fill(image):
        for y in (156, 180, 204, 228):
            for x in (620, 720, 820):
                cv2.putText(
                    image, "Text", (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2,
                )
    path = _grid_image(tmp_path, extra=(fill,))

    result = detect_choice_grids(path, _three_column_analysis())

    assert result.choiceGrids == []
    assert result.choiceGridDetection.acceptedCount == 0


def test_rejects_grammar_conjugation_table(tmp_path):
    def draw(image):
        cv2.line(image, (150, 144), (900, 144), (0, 0, 0), 2)
        cv2.line(image, (150, 168), (900, 168), (0, 0, 0), 2)
        cv2.line(image, (150, 192), (900, 192), (0, 0, 0), 2)
        cv2.line(image, (150, 216), (900, 216), (0, 0, 0), 2)
        cv2.line(image, (450, 144), (450, 276), (0, 0, 0), 2)
        cv2.line(image, (700, 144), (700, 276), (0, 0, 0), 2)
        for i, y in enumerate((156, 180, 204, 240)):
            cv2.putText(
                image, "ich", (180, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1
            )
            cv2.putText(
                image, "bin", (480, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1
            )
            cv2.putText(
                image, "habe", (730, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1
            )
    path = _grid_image(tmp_path, rules=(), verticals=(), extra=(draw,))
    analysis = _analysis(
        ("h1", "ich", 0.18, 0.20, 0.05, 0.02),
        ("h2", "sein", 0.48, 0.20, 0.06, 0.02),
        ("h3", "haben", 0.73, 0.20, 0.07, 0.02),
    )

    result = detect_choice_grids(str(path), analysis)

    assert result.choiceGrids == []


def test_rejects_decorative_bordered_box(tmp_path):
    def draw(image):
        cv2.rectangle(image, (150, 140), (900, 280), (0, 0, 0), 2)
        cv2.putText(
            image, "Wichtige Information", (200, 200),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1,
        )
    path = _grid_image(tmp_path, rules=(), verticals=(), extra=(draw,))
    analysis = _analysis(
        ("title", "Wichtige Information", 0.20, 0.30, 0.40, 0.03),
    )

    result = detect_choice_grids(str(path), analysis)

    assert result.choiceGrids == []


def test_rejects_grid_without_header_labels(tmp_path):
    path = _grid_image(tmp_path)
    analysis = _analysis(
        ("row-1", "Satz eins.", 0.10, 0.25, 0.30, 0.02),
        ("row-2", "Satz zwei.", 0.10, 0.29, 0.30, 0.02),
        ("row-3", "Satz drei.", 0.10, 0.33, 0.30, 0.02),
    )

    result = detect_choice_grids(path, analysis)

    assert result.choiceGrids == []


def test_rejects_grid_without_prompts(tmp_path):
    path = _grid_image(tmp_path)
    analysis = _analysis(
        ("label-1", "ja", 0.60, 0.20, 0.05, 0.02),
        ("label-2", "nein", 0.72, 0.20, 0.06, 0.02),
        ("label-3", "doch", 0.82, 0.20, 0.06, 0.02),
    )

    result = detect_choice_grids(path, analysis)

    assert result.choiceGrids == []


def test_rejects_horizontal_only_separators(tmp_path):
    path = _grid_image(tmp_path, verticals=())

    result = detect_choice_grids(path, _three_column_analysis())

    assert result.choiceGrids == []


def test_rejects_no_grid_page(tmp_path):
    path = _grid_image(tmp_path, rules=(), verticals=())
    analysis = _three_column_analysis()

    result = detect_choice_grids(path, analysis)

    assert result.choiceGrids == []
    assert result.choiceGridDetection is not None
    assert result.choiceGridDetection.rawCandidateCount == 0
    assert result.choiceGridDetection.acceptedCount == 0


def test_rows_are_ordered_top_to_bottom(tmp_path):
    path = _grid_image(tmp_path)

    result = detect_choice_grids(path, _three_column_analysis())

    ys = [row.rowBbox.y for row in result.choiceGrids[0].rows]
    assert ys == sorted(ys)


def test_accepts_grid_with_short_option_labels(tmp_path):
    path = _grid_image(tmp_path)
    analysis = _analysis(
        ("label-1", "A", 0.60, 0.20, 0.03, 0.02),
        ("label-2", "B", 0.72, 0.20, 0.03, 0.02),
        ("label-3", "C", 0.82, 0.20, 0.03, 0.02),
        ("row-1", "Satz eins.", 0.10, 0.25, 0.30, 0.02),
        ("row-2", "Satz zwei.", 0.10, 0.29, 0.30, 0.02),
        ("row-3", "Satz drei.", 0.10, 0.33, 0.30, 0.02),
    )

    result = detect_choice_grids(str(path), analysis)

    assert len(result.choiceGrids) == 1
    assert [o.label for o in result.choiceGroups[0].options] == ["A", "B", "C"]


def test_accepts_grid_under_noisy_background(tmp_path):
    def noise(image):
        rng = np.random.default_rng(7)
        mask = rng.random((HEIGHT, WIDTH)) < 0.003
        image[mask] = 0
    path = _grid_image(tmp_path, extra=(noise,))

    result = detect_choice_grids(path, _three_column_analysis())

    assert len(result.choiceGrids) == 1
    assert len(result.choiceGrids[0].rows) == 4


def test_detection_is_deterministic(tmp_path):
    path = _grid_image(tmp_path)
    analysis = _three_column_analysis()

    first = detect_choice_grids(path, analysis)
    second = detect_choice_grids(path, analysis)

    assert first.choiceGrids == second.choiceGrids
    assert first.choiceGroups == second.choiceGroups


def test_rejects_dimension_mismatch(tmp_path):
    path = _grid_image(tmp_path)
    analysis = _three_column_analysis().model_copy(update={"width": WIDTH - 1})

    with pytest.raises(ValueError, match="dimensions do not match"):
        detect_choice_grids(path, analysis)


def test_dotted_vertical_divider_still_detects(tmp_path):
    def draw(image):
        for y0, y1 in ((168, 192), (192, 216), (216, 240)):
            cv2.line(image, (720, y0), (720, y1), (0, 0, 0), 2)
    path = _grid_image(tmp_path, verticals=(600, 840), extra=(draw,))
    analysis = _analysis(
        ("label-1", "ja", 0.60, 0.20, 0.05, 0.02),
        ("label-2", "nein", 0.72, 0.20, 0.06, 0.02),
        ("label-3", "doch", 0.84, 0.20, 0.06, 0.02),
        ("row-1", "Satz eins.", 0.10, 0.25, 0.30, 0.02),
        ("row-2", "Satz zwei.", 0.10, 0.29, 0.30, 0.02),
        ("row-3", "Satz drei.", 0.10, 0.33, 0.30, 0.02),
        ("row-4", "Satz vier.", 0.10, 0.37, 0.30, 0.02),
    )

    result = detect_choice_grids(str(path), analysis)

    assert len(result.choiceGrids) == 1
    assert len(result.choiceGrids[0].rows[0].cells) == 3


def test_multi_line_row_prompt(tmp_path):
    path = _grid_image(tmp_path)
    analysis = _analysis(
        ("label-1", "ja", 0.60, 0.20, 0.05, 0.02),
        ("label-2", "nein", 0.72, 0.20, 0.06, 0.02),
        ("label-3", "doch", 0.82, 0.20, 0.06, 0.02),
        ("row-1a", "Satz eins", 0.10, 0.28, 0.25, 0.02),
        ("row-1b", "und mehr.", 0.10, 0.30, 0.25, 0.02),
        ("row-2", "Satz zwei.", 0.10, 0.33, 0.30, 0.02),
    )

    result = detect_choice_grids(path, analysis)

    assert len(result.choiceGrids[0].rows) == 2
    assert result.choiceGrids[0].rows[0].nearbyTextSpanIds == ["row-1a"]
