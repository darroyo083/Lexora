import logging

from app.document.blank_detection import detect_exercise_blanks
from app.document.choice_detection import detect_choice_interactions
from app.document.grid_detection import detect_choice_grids
from app.document.matching_detection import detect_matchings
from app.document.sentence_ordering_detection import detect_sentence_orderings
from app.schemas.page_analysis import PageAnalysis


logger = logging.getLogger("uvicorn.error")


def detect_interactions(
    image_path: str,
    analysis: PageAnalysis,
) -> PageAnalysis:
    """Run all graphical exercise interaction detectors on one raster pass.

    Blank detection, choice-marker detection, choice-grid detection,
    sentence-ordering detection, and matching detection share the same raster
    and OCR result. Each detector is independent and returns the enriched
    analysis.
    """
    logger.info(
        "Interaction detection started page=%s", analysis.pageNumber
    )
    analysis = detect_exercise_blanks(image_path, analysis)
    analysis = detect_choice_interactions(image_path, analysis)
    analysis = detect_choice_grids(image_path, analysis)
    analysis = detect_sentence_orderings(image_path, analysis)
    analysis = detect_matchings(image_path, analysis)
    logger.info(
        "Interaction detection completed page=%s", analysis.pageNumber
    )
    return analysis
