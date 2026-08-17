package com.lexora.assist.application;

import com.lexora.assist.contract.AssistContext;
import com.lexora.assist.contract.AssistContract.SelectionRect;
import com.lexora.book.application.BookService;
import com.lexora.correction.application.CorrectionResolutionService;
import com.lexora.correction.domain.PageCorrectionResolution;
import com.lexora.documentanalysis.contract.PageAnalysis;
import com.lexora.shared.error.BookNotFoundException;
import com.lexora.shared.error.PageNotFoundException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reconstructs canonical exercise context from Lexora's own persisted page
 * analysis. The client supplies only a strict interaction id; this builder
 * resolves it to the exercise kind, instruction, relevant source text, and
 * options — bounded to a hard character limit. Also reports whether a
 * deterministic source-backed answer is available, so {@code check} can never
 * override authoritative grading.
 */
@Component
public class AssistContextBuilder {

    private static final double LINE_EDGE_TOLERANCE = 0.003;

    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    private final BookService bookService;
    private final CorrectionResolutionService resolutionService;
    private final int maxContextChars;

    public AssistContextBuilder(BookService bookService,
                                CorrectionResolutionService resolutionService,
                                AssistConfiguration configuration) {
        this.bookService = bookService;
        this.resolutionService = resolutionService;
        this.maxContextChars = configuration.maxContextChars();
    }

    /** Result of context reconstruction; null when identity is stale/ambiguous. */
    public record BuiltContext(AssistContext context, boolean sourceBacked) {}

    public BuiltContext build(UUID bookId, int pageNumber, String exerciseId,
                              String answer, String targetLanguage) {
        return build(bookId, pageNumber, exerciseId, answer, targetLanguage, null);
    }

    public BuiltContext build(UUID bookId, int pageNumber, String exerciseId,
                              String answer, String targetLanguage, String question) {
        var book = bookService.getBook(bookId).orElseThrow(() -> new BookNotFoundException(bookId));
        if (pageNumber < 1 || pageNumber > book.pageCount()) {
            throw new PageNotFoundException(bookId, pageNumber);
        }
        var page = bookService.getPage(bookId, pageNumber).orElse(null);
        if (page == null || page.analysis() == null || page.analysis().isBlank()) {
            return null;
        }
        PageAnalysis analysis;
        try {
            analysis = JSON.readValue(page.analysis(), PageAnalysis.class);
        } catch (Exception e) {
            return null;
        }

        var interaction = findInteraction(analysis, exerciseId);
        if (interaction == null) {
            return null;
        }
        var exercise = findSemanticExercise(analysis, interaction.id());

        String title = book.title();
        if (exercise != null && exercise.title() != null && !exercise.title().isBlank()) {
            title = title + " — " + exercise.title();
        }
        String instruction = exercise != null ? orEmpty(exercise.instruction()) : "";
        String source = sourceText(analysis, exercise, interaction);
        List<String> options = optionsFor(analysis, interaction);

        var resolution = resolutionService.resolve(bookId, pageNumber);
        boolean sourceBacked = isSourceBacked(interaction.kind(), interaction.ordinal(), resolution);

        return new BuiltContext(
            new AssistContext(title, instruction, source, interaction.kind(),
                options, answer, orEmpty(book.sourceLanguage()), targetLanguage, question),
            sourceBacked
        );
    }

    public BuiltContext buildSelection(UUID bookId, int pageNumber, SelectionRect selection,
                                       String question, String targetLanguage) {
        var book = bookService.getBook(bookId).orElseThrow(() -> new BookNotFoundException(bookId));
        if (pageNumber < 1 || pageNumber > book.pageCount()) {
            throw new PageNotFoundException(bookId, pageNumber);
        }
        if (!validSelection(selection)) return null;
        var page = bookService.getPage(bookId, pageNumber).orElse(null);
        if (page == null || page.analysis() == null || page.analysis().isBlank()) return null;
        PageAnalysis analysis;
        try {
            analysis = JSON.readValue(page.analysis(), PageAnalysis.class);
        } catch (Exception e) {
            return null;
        }
        var selectedExercises = selectedSemanticExercises(analysis, selection);
        var source = selectedText(analysis, selection, selectedExercises);
        if (source.isBlank()) return null;

        var title = book.title() + " — selected page region";
        var instruction = "";
        var exerciseKind = "selection";
        if (selectedExercises.size() == 1) {
            var exercise = selectedExercises.getFirst();
            if (hasVisibleSemanticHeader(analysis, exercise, selection)) {
                var number = orEmpty(exercise.number());
                var exerciseTitle = orEmpty(exercise.title());
                var label = number.isBlank() ? exerciseTitle
                    : "Exercise " + number + (exerciseTitle.isBlank() ? "" : ": " + exerciseTitle);
                if (!label.isBlank()) title = book.title() + " — " + label;
                instruction = orEmpty(exercise.instruction());
            }
            if (!orEmpty(exercise.kind()).isBlank()) exerciseKind = exercise.kind();
        } else if (!selectedExercises.isEmpty()) {
            var numbers = selectedExercises.stream()
                .map(exercise -> orEmpty(exercise.number()))
                .filter(number -> !number.isBlank())
                .toList();
            if (!numbers.isEmpty()) {
                title = book.title() + " — selected exercises " + String.join(", ", numbers);
            }
        }
        return new BuiltContext(
            new AssistContext(title, instruction, source,
                exerciseKind, List.of(), null, orEmpty(book.sourceLanguage()), targetLanguage, question),
            false
        );
    }

    private static List<PageAnalysis.SemanticExercise> selectedSemanticExercises(
        PageAnalysis analysis, SelectionRect selection) {
        return analysis.semanticExercises().stream()
            .filter(exercise -> selectsExercise(exercise.bbox(), selection))
            .toList();
    }

    private static boolean hasVisibleSemanticHeader(
        PageAnalysis analysis, PageAnalysis.SemanticExercise exercise, SelectionRect selection) {
        var title = orEmpty(exercise.title()).trim();
        var instruction = orEmpty(exercise.instruction()).trim();
        return analysis.textSpans().stream()
            .anyMatch(span -> {
                if (span == null || !intersects(span.bbox(), selection, LINE_EDGE_TOLERANCE)) {
                    return false;
                }
                var text = orEmpty(span.text()).trim();
                return (!title.isBlank() && title.equals(text))
                    || (!instruction.isBlank() && instruction.equals(text));
            });
    }

    private String selectedText(PageAnalysis analysis, SelectionRect selection,
                                List<PageAnalysis.SemanticExercise> selectedExercises) {
        Set<String> exerciseOwnedSpanIds = new HashSet<>();
        Set<String> selectedExerciseSpanIds = new HashSet<>();
        for (var exercise : analysis.semanticExercises()) {
            exerciseOwnedSpanIds.addAll(exercise.contextSpanIds());
        }
        for (var exercise : selectedExercises) {
            selectedExerciseSpanIds.addAll(exercise.contextSpanIds());
        }
        var selectedTextRanges = selectedExercises.stream()
            .map(exercise -> textRange(analysis, exercise))
            .filter(Objects::nonNull)
            .toList();

        return analysis.textSpans().stream()
            .filter(span -> span != null && span.text() != null && !span.text().isBlank())
            .filter(span -> intersects(span.bbox(), selection, LINE_EDGE_TOLERANCE))
            // OCR/text extraction boxes can drift across an exercise boundary.
            // When the rectangle clearly identifies semantic exercise regions,
            // admit only their owned spans that are visibly selected and unowned
            // structural labels within their selected text range.
            .filter(span -> selectedExercises.isEmpty()
                || selectedExerciseSpanIds.contains(span.id())
                || (!exerciseOwnedSpanIds.contains(span.id())
                    && selectedTextRanges.stream().anyMatch(range -> range.contains(span.bbox()))))
            .sorted(java.util.Comparator
                .comparingDouble((PageAnalysis.TextSpan span) -> span.bbox() == null ? 1 : span.bbox().y())
                .thenComparingDouble(span -> span.bbox() == null ? 1 : span.bbox().x()))
            .map(PageAnalysis.TextSpan::text)
            .reduce((left, right) -> left + " " + right)
            .map(this::bound)
            .orElse("");
    }

    private record VerticalRange(double top, double bottom) {
        boolean contains(PageAnalysis.BBox bbox) {
            if (bbox == null) return false;
            double center = bbox.y() + bbox.height() / 2;
            return center >= top - LINE_EDGE_TOLERANCE
                && center <= bottom + LINE_EDGE_TOLERANCE;
        }
    }

    private static VerticalRange textRange(PageAnalysis analysis,
                                           PageAnalysis.SemanticExercise exercise) {
        var spanIds = new HashSet<>(exercise.contextSpanIds());
        var boxes = analysis.textSpans().stream()
            .filter(span -> span != null && spanIds.contains(span.id()) && span.bbox() != null)
            .map(PageAnalysis.TextSpan::bbox)
            .toList();
        if (boxes.isEmpty()) return null;
        double top = boxes.stream().mapToDouble(PageAnalysis.BBox::y).min().orElse(0);
        double bottom = boxes.stream()
            .mapToDouble(box -> box.y() + box.height()).max().orElse(top);
        return new VerticalRange(top, bottom);
    }

    private static boolean validSelection(SelectionRect selection) {
        if (selection == null) return false;
        double x = selection.x();
        double y = selection.y();
        double width = selection.width();
        double height = selection.height();
        return Double.isFinite(x) && Double.isFinite(y)
            && Double.isFinite(width) && Double.isFinite(height)
            && x >= 0 && y >= 0 && width > 0 && height > 0
            && x + width <= 1 && y + height <= 1;
    }

    private static boolean selectsExercise(PageAnalysis.BBox bbox, SelectionRect selection) {
        if (bbox == null) return false;
        double selectionCenterX = selection.x() + selection.width() / 2;
        double selectionCenterY = selection.y() + selection.height() / 2;
        double exerciseCenterX = bbox.x() + bbox.width() / 2;
        double exerciseCenterY = bbox.y() + bbox.height() / 2;
        return contains(bbox, selectionCenterX, selectionCenterY)
            || contains(selection, exerciseCenterX, exerciseCenterY);
    }

    private static boolean contains(PageAnalysis.BBox bbox, double x, double y) {
        return x >= bbox.x() && x <= bbox.x() + bbox.width()
            && y >= bbox.y() && y <= bbox.y() + bbox.height();
    }

    private static boolean contains(SelectionRect selection, double x, double y) {
        return x >= selection.x() && x <= selection.x() + selection.width()
            && y >= selection.y() && y <= selection.y() + selection.height();
    }

    private static boolean intersects(PageAnalysis.BBox bbox, SelectionRect selection,
                                      double tolerance) {
        if (bbox == null) return false;
        return bbox.x() < selection.x() + selection.width() + tolerance
            && bbox.x() + bbox.width() > selection.x() - tolerance
            && bbox.y() < selection.y() + selection.height() + tolerance
            && bbox.y() + bbox.height() > selection.y() - tolerance;
    }

    private record Interaction(String id, String kind, int ordinal, List<String> nearbySpanIds) {}

    private static Interaction findInteraction(PageAnalysis analysis, String exerciseId) {
        var blanks = analysis.exerciseBlanks();
        for (int i = 0; i < blanks.size(); i++) {
            if (blanks.get(i).id().equals(exerciseId)) {
                return new Interaction(exerciseId, "fill-in-line", i, blanks.get(i).nearbyTextSpanIds());
            }
        }
        var choices = analysis.choiceTargets();
        for (int i = 0; i < choices.size(); i++) {
            if (choices.get(i).id().equals(exerciseId)) {
                return new Interaction(exerciseId, "choice", i, choices.get(i).nearbyTextSpanIds());
            }
        }
        var grids = analysis.choiceGrids();
        for (int i = 0; i < grids.size(); i++) {
            var grid = grids.get(i);
            if (grid.id().equals(exerciseId)
                || grid.rows().stream().anyMatch(row -> row.id().equals(exerciseId))) {
                var nearbySpanIds = grid.rows().stream()
                    .flatMap(row -> row.nearbyTextSpanIds().stream())
                    .distinct()
                    .toList();
                // A choice-grid is one source-backed exercise. Row ids are
                // answer storage keys, not valid AI-context identities, so
                // both forms resolve to the grid's canonical id.
                return new Interaction(grid.id(), "choice-grid", i, nearbySpanIds);
            }
        }
        var orderings = analysis.sentenceOrderings();
        for (int i = 0; i < orderings.size(); i++) {
            var ordering = orderings.get(i);
            if (ordering.id().equals(exerciseId)
                || (ordering.exerciseId() != null && ordering.exerciseId().equals(exerciseId))) {
                var nearbySpanIds = orderings.stream()
                    .filter(candidate -> ordering.id().equals(exerciseId)
                        ? candidate.id().equals(exerciseId)
                        : ordering.exerciseId().equals(candidate.exerciseId()))
                    .flatMap(candidate -> candidate.nearbyTextSpanIds().stream())
                    .distinct()
                    .toList();
                // Sentence-ordering groups are represented by one exerciseId
                // with several prompt interactions. Resolve the group so the
                // AI receives the complete token set, not only the first row.
                return new Interaction(
                    ordering.exerciseId() == null || ordering.exerciseId().isBlank()
                        ? ordering.id() : ordering.exerciseId(),
                    "sentence-ordering", i, nearbySpanIds);
            }
        }
        var matchings = analysis.matchingInteractions();
        for (int i = 0; i < matchings.size(); i++) {
            if (matchings.get(i).id().equals(exerciseId)) {
                return new Interaction(exerciseId, "matching", i, matchings.get(i).nearbyTextSpanIds());
            }
        }
        var freeTexts = analysis.freeTextInteractions();
        for (int i = 0; i < freeTexts.size(); i++) {
            if (freeTexts.get(i).id().equals(exerciseId)) {
                return new Interaction(exerciseId, "free-text", i, freeTexts.get(i).nearbyTextSpanIds());
            }
        }
        return null;
    }

    private static PageAnalysis.SemanticExercise findSemanticExercise(PageAnalysis analysis,
                                                                      String exerciseId) {
        return analysis.semanticExercises().stream()
            .filter(e -> Objects.equals(e.id(), exerciseId) || e.interactionIds().contains(exerciseId))
            .findFirst()
            .orElse(null);
    }

    private String sourceText(PageAnalysis analysis,
                              PageAnalysis.SemanticExercise exercise,
                              Interaction interaction) {
        var spanIds = exercise != null && !exercise.contextSpanIds().isEmpty()
            ? exercise.contextSpanIds()
            : interaction.nearbySpanIds();
        var byId = new java.util.HashMap<String, PageAnalysis.TextSpan>();
        for (var span : analysis.textSpans()) {
            byId.put(span.id(), span);
        }
        var builder = new StringBuilder();
        for (var id : spanIds) {
            var span = byId.get(id);
            if (span != null && span.text() != null) {
                if (builder.length() > 0) builder.append(' ');
                builder.append(span.text());
                if (builder.length() >= maxContextChars) {
                    break;
                }
            }
        }
        return bound(builder.toString());
    }

    private static List<String> optionsFor(PageAnalysis analysis, Interaction interaction) {
        return switch (interaction.kind()) {
            case "choice" -> {
                var target = analysis.choiceTargets().stream()
                    .filter(t -> t.id().equals(interaction.id())).findFirst().orElse(null);
                yield target == null ? List.<String>of()
                    : analysis.choiceGroups().stream()
                        .filter(g -> g.id().equals(target.optionGroupId()))
                        .flatMap(g -> g.options().stream())
                        .map(PageAnalysis.ChoiceOption::label)
                        .toList();
            }
            case "choice-grid" -> {
                var grid = analysis.choiceGrids().stream()
                    .filter(g -> g.id().equals(interaction.id())).findFirst().orElse(null);
                yield grid == null ? List.<String>of()
                    : analysis.choiceGroups().stream()
                        .filter(g -> g.id().equals(grid.optionGroupId()))
                        .flatMap(g -> g.options().stream())
                        .map(PageAnalysis.ChoiceOption::label)
                        .toList();
            }
            case "sentence-ordering" -> {
                yield analysis.sentenceOrderings().stream()
                    .filter(ordering -> ordering.id().equals(interaction.id())
                        || (ordering.exerciseId() != null
                            && ordering.exerciseId().equals(interaction.id())))
                    .flatMap(ordering -> ordering.items().stream())
                    .map(PageAnalysis.SentenceOrderingItem::text)
                    .toList();
            }
            case "matching" -> {
                var matching = analysis.matchingInteractions().stream()
                    .filter(m -> m.id().equals(interaction.id())).findFirst().orElse(null);
                if (matching == null) {
                    yield List.of();
                }
                var items = new ArrayList<String>();
                matching.leftItems().forEach(i -> items.add(i.label() + ". " + i.text()));
                matching.rightItems().forEach(i -> items.add(i.label() + ". " + i.text()));
                yield items;
            }
            default -> List.of();
        };
    }

    private static boolean isSourceBacked(String kind, int ordinal,
                                          PageCorrectionResolution resolution) {
        if ("free-text".equals(kind)) {
            return false;
        }
        for (var slot : resolution.slots()) {
            if (slot.interactionKind().equals(kind) && slot.ordinal() == ordinal) {
                return PageCorrectionResolution.RESOLVED.equals(slot.resolution());
            }
        }
        return false;
    }

    private String bound(String value) {
        if (value == null) return "";
        return value.length() > maxContextChars ? value.substring(0, maxContextChars) : value;
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }
}
