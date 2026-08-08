import logging
import re
from dataclasses import dataclass

from app.answer_key.parser import (
    AnswerKeyEntry,
    AnswerKeyParser,
    MatchingExpectedAnswer,
    MatchingPair,
    TextExpectedAnswer,
    ReferenceExpectedAnswer,
)

logger = logging.getLogger(__name__)

EXERCISE_HEADER_RE = re.compile(
    r'^(?P<num>\d{1,3})\s+(?!\d)(?P<title>.+)$'
)
SUB_EXERCISE_RE = re.compile(
    r'^(?P<marker>\d{1,2}[a-z]?)\s+(?P<items>\d.+)$'
)
MATCHING_ANSWER_RE = re.compile(
    r'^(?P<num>\d+)(?P<letter>[A-F])\s*—\s*(?P<rest>.*)$'
)
DASH_SEPARATED_RE = re.compile(r'\s*—\s*')
LOESUNGEN_RE = re.compile(r'^Lösungen$', re.IGNORECASE)
PAGE_NUMBER_RE = re.compile(r'^\d{1,4}$')
STANDALONE_NUM_RE = re.compile(r'^\d{1,3}$')
JE_DESTO_RE = re.compile(
    r'^(?P<num>\d+)[.)]\s+(?P<items>.+)$'
)

InteractionKind = str

MATCHING_PAIRS_RE = re.compile(r'(?P<num>\d+)(?P<letter>[A-F])')


@dataclass
class Span:
    id: str
    text: str
    confidence: float
    y: float
    x: float
    parent_line_id: str | None = None

    @property
    def line_id(self) -> str:
        return self.parent_line_id or self.id


def _build_spans(raw_spans: list[dict]) -> list[Span]:
    spans: list[Span] = []
    for s in raw_spans:
        text = s.get("text", "").strip()
        if not text:
            continue
        bbox = s.get("bbox", {})
        spans.append(Span(
            id=s.get("id", ""),
            text=text,
            confidence=float(s.get("confidence", 0)),
            y=float(bbox.get("y", 0)),
            x=float(bbox.get("x", 0)),
            parent_line_id=s.get("parentLineId"),
        ))
    return spans


def _group_lines(spans: list[Span]) -> list[list[Span]]:
    if not spans:
        return []
    sorted_spans = sorted(spans, key=lambda s: (s.y, s.x))
    lines: list[list[Span]] = []
    current_line: list[Span] = [sorted_spans[0]]
    for span in sorted_spans[1:]:
        if span.line_id != current_line[0].line_id:
            lines.append(current_line)
            current_line = [span]
        else:
            current_line.append(span)
    lines.append(current_line)
    return lines


def _line_text(line: list[Span]) -> str:
    sorted_line = sorted(line, key=lambda s: s.x)
    return " ".join(s.text for s in sorted_line)


def _line_confidence(line: list[Span]) -> float:
    if not line:
        return 0.0
    return sum(s.confidence for s in line) / len(line)


def _is_page_number(line: list[Span]) -> bool:
    return len(line) == 1 and PAGE_NUMBER_RE.match(line[0].text) is not None


def _infer_interaction_kind(exercise_title: str) -> InteractionKind:
    title_lower = exercise_title.lower()
    if any(kw in title_lower for kw in ["relativsatz", "nebensatz", "konnektor", "vergleich"]):
        return "FillBlank"
    if any(kw in title_lower for kw in ["partizip", "adjektiv", "adjektivdeklination", "präposition"]):
        return "FillBlank"
    if "zuordnen" in title_lower or "matching" in title_lower:
        return "Matching"
    if any(kw in title_lower for kw in ["satzstellung", "satzbau", "wortstellung", "ordnung"]):
        return "SentenceOrdering"
    return "FillBlank"


def _cluster_lines_by_column(
    lines: list[list[Span]], x_tolerance: float = 0.15
) -> list[list[list[Span]]]:
    if not lines:
        return []
    clusters: list[list[list[Span]]] = []
    assigned: set[int] = set()
    for i, line in enumerate(lines):
        if i in assigned:
            continue
        line_x = min(s.x for s in line)
        cluster: list[list[Span]] = [line]
        assigned.add(i)
        for j, other_line in enumerate(lines):
            if j in assigned:
                continue
            other_x = min(s.x for s in other_line)
            if abs(line_x - other_x) < x_tolerance:
                cluster.append(other_line)
                assigned.add(j)
        clusters.append(cluster)
    clusters.sort(key=lambda c: min(min(s.x for s in line) for line in c))
    for cluster in clusters:
        cluster.sort(key=lambda line: min(s.y for s in line))
    return clusters


def _parse_matching_pairs(raw_text: str) -> MatchingExpectedAnswer | None:
    pairs: list[MatchingPair] = []
    segments = re.split(r'\s*[—–\-]\s*', raw_text)
    for seg in segments:
        seg = seg.strip()
        for m in MATCHING_PAIRS_RE.finditer(seg):
            pairs.append(MatchingPair(
                leftLabel=m.group("num"),
                rightLabel=m.group("letter"),
            ))
    if len(pairs) >= 2:
        return MatchingExpectedAnswer(pairs=pairs)
    return None


def _build_typed_payload(
    interaction_kind: InteractionKind,
    primary: str,
    raw_text: str,
) -> TextExpectedAnswer | MatchingExpectedAnswer | None:
    if interaction_kind == "Matching":
        matching = _parse_matching_pairs(raw_text)
        if matching:
            return matching
        return _parse_matching_pairs(primary)
    if interaction_kind == "FillBlank":
        return TextExpectedAnswer(value=primary)
    return None


class CornelsenAnswerKeyParser(AnswerKeyParser):
    def publisher(self) -> str:
        return "cornelsen"

    def parse(self, text_spans: list[dict]) -> list[AnswerKeyEntry]:
        spans = _build_spans(text_spans)
        if not spans:
            return []

        raw_lines = _group_lines(spans)

        column_clusters = _cluster_lines_by_column(raw_lines)
        multi_column_lines: list[list[Span]] = []
        if len(column_clusters) >= 2:
            valid_clusters = [
                c for c in column_clusters if len(c) >= 3
            ]
            if len(valid_clusters) >= 2:
                for cluster in valid_clusters:
                    multi_column_lines.extend(cluster)
            else:
                multi_column_lines = raw_lines
        else:
            multi_column_lines = raw_lines

        lines = multi_column_lines
        entries: list[AnswerKeyEntry] = []
        page_number = 0

        for s in spans:
            if s.id.startswith("span-"):
                parts = s.id.split("-")
                if len(parts) >= 2:
                    try:
                        page_number = int(parts[1])
                    except ValueError:
                        pass
                break
        if page_number < 1:
            page_number = 1

        current_exercise_num: str | None = None
        current_exercise_title: str | None = None
        current_interaction_kind: InteractionKind = "FillBlank"
        ordinal = 0
        in_answer_key = False

        i = 0
        while i < len(lines):
            line = lines[i]
            text = _line_text(line)

            if not in_answer_key:
                if LOESUNGEN_RE.match(text):
                    in_answer_key = True
                i += 1
                continue

            header_match = EXERCISE_HEADER_RE.match(text)
            if header_match:
                current_exercise_num = header_match.group("num")
                current_exercise_title = header_match.group("title")
                current_interaction_kind = _infer_interaction_kind(
                    current_exercise_title
                )
                ordinal = 0
                logger.debug(
                    "Exercise header: %s %s (kind=%s)",
                    current_exercise_num,
                    current_exercise_title,
                    current_interaction_kind,
                )
                i += 1
                continue

            if STANDALONE_NUM_RE.match(text) and i + 1 < len(lines):
                next_text = _line_text(lines[i + 1])
                if (not SUB_EXERCISE_RE.match(next_text)
                        and not STANDALONE_NUM_RE.match(next_text)
                        and not _is_page_number(lines[i + 1])
                        and not next_text.startswith(".")):
                    current_exercise_num = text.strip()
                    current_exercise_title = next_text
                    current_interaction_kind = _infer_interaction_kind(
                        current_exercise_title
                    )
                    ordinal = 0
                    logger.debug(
                        "Multi-line exercise header: %s %s (kind=%s)",
                        current_exercise_num,
                        current_exercise_title,
                        current_interaction_kind,
                    )
                    i += 2
                    continue

            if current_exercise_num is None:
                i += 1
                continue

            sub_match = SUB_EXERCISE_RE.match(text)
            je_match = JE_DESTO_RE.match(text)

            if sub_match or je_match:
                ordinal += 1
                match_obj = sub_match or je_match
                marker = match_obj.group("marker") if sub_match else match_obj.group("num")
                items_text = (
                    match_obj.group("items") if sub_match
                    else match_obj.group("items")
                )

                warnings: list[str] = []
                alternatives: list[str] = []

                if "—" in items_text and not _is_complex_sentence(items_text):
                    parts = DASH_SEPARATED_RE.split(items_text)
                    primary = parts[0].strip()
                    alternatives = [p.strip() for p in parts[1:] if p.strip()]
                elif "/" in items_text and len(items_text) < 200:
                    parts = items_text.split("/")
                    primary = parts[0].strip()
                    alternatives = [p.strip() for p in parts[1:] if p.strip()]
                elif "," in items_text and _looks_comma_separated(items_text):
                    parts = _split_answers(items_text)
                    primary = parts[0].strip()
                    alternatives = [p.strip() for p in parts[1:] if p.strip()]
                else:
                    primary = items_text.strip()

                confidence = _line_confidence(line)

                if _is_low_confidence_line(line):
                    warnings.append(
                        "low_ocr_confidence: "
                        + ",".join(
                            f"{s.text}={s.confidence:.2f}" for s in line
                            if s.confidence < 0.90
                        )
                    )

                if _looks_corrupted(items_text):
                    warnings.append("possible_ocr_corruption")

                typed_payload = _build_typed_payload(
                    current_interaction_kind, primary, text
                )

                entries.append(AnswerKeyEntry(
                    pageNumber=page_number,
                    exerciseNumber=current_exercise_num,
                    interactionKind=current_interaction_kind,
                    ordinal=ordinal,
                    expectedValue=primary,
                    alternatives=alternatives,
                    rawSolutionText=text,
                    confidence=round(confidence, 4),
                    mappingWarnings=warnings,
                    typedPayload=typed_payload,
                ))
                i += 1
                continue

            if _is_continuation_line(text) and entries:
                prev = entries[-1]
                prev.expectedValue += " " + text
                prev.rawSolutionText += " | " + text
                if _is_low_confidence_line(line):
                    prev.mappingWarnings.append("continuation_low_confidence")
                i += 1
                continue

            i += 1

        return entries


def _is_complex_sentence(text: str) -> bool:
    word_count = len(text.split())
    if word_count > 6:
        return True
    if any(kw in text.lower() for kw in [
        "sowohl", "weder", "entweder", "nicht nur", "je mehr",
        "desto", "umso", "bevor",
    ]):
        return True
    return False


def _looks_comma_separated(text: str) -> bool:
    parts = text.split(",")
    if len(parts) < 2:
        return False
    total_words = len(text.split())
    if total_words > 15:
        return False
    for p in parts:
        words = len(p.strip().split())
        if words > 5:
            return False
    return True


def _split_answers(text: str) -> list[str]:
    parts = text.split(",")
    result: list[str] = []
    for p in parts:
        p = p.strip()
        if p:
            result.append(p)
    return result


def _is_continuation_line(text: str) -> bool:
    if not text:
        return False
    if SUB_EXERCISE_RE.match(text):
        return False
    if EXERCISE_HEADER_RE.match(text):
        return False
    if PAGE_NUMBER_RE.match(text) and len(text) <= 4:
        return False
    first_word = text.split()[0] if text.split() else ""
    return not first_word.rstrip(".").isdigit()


def _is_low_confidence_line(line: list[Span]) -> bool:
    return any(s.confidence < 0.90 for s in line)


def _looks_corrupted(text: str) -> bool:
    if len(text) < 2:
        return False
    fragments = text.split()
    for frag in fragments:
        if len(frag) <= 2 and not frag.isdigit() and frag not in {
            "a", "b", "c", "d", "e", "f",
            "A", "B", "C", "D", "E", "F",
            "is", "es", "er", "sie", "du", "da", "um", "an", "in",
            "im", "am", "zu", "so", "ja", "ne", "ob", "je",
            "1", "2", "3", "4", "5", "6", "7", "8", "9",
        }:
            if any(ord(c) < 32 or (127 <= ord(c) <= 160) for c in frag):
                return True
    return False
