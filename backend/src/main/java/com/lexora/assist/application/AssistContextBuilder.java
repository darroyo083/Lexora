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
import java.util.List;
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
        var exercise = findSemanticExercise(analysis, exerciseId);

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
        var source = selectedText(analysis, selection);
        if (source.isBlank()) return null;
        return new BuiltContext(
            new AssistContext(book.title() + " — selected page region", "", source,
                "selection", List.of(), null, orEmpty(book.sourceLanguage()), targetLanguage, question),
            false
        );
    }

    private String selectedText(PageAnalysis analysis, SelectionRect selection) {
        return analysis.textSpans().stream()
            .filter(span -> span != null && span.text() != null && !span.text().isBlank())
            .filter(span -> intersects(span.bbox(), selection))
            .sorted(java.util.Comparator
                .comparingDouble((PageAnalysis.TextSpan span) -> span.bbox() == null ? 1 : span.bbox().y())
                .thenComparingDouble(span -> span.bbox() == null ? 1 : span.bbox().x()))
            .map(PageAnalysis.TextSpan::text)
            .reduce((left, right) -> left + " " + right)
            .map(this::bound)
            .orElse("");
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

    private static boolean intersects(PageAnalysis.BBox bbox, SelectionRect selection) {
        if (bbox == null) return false;
        return bbox.x() < selection.x() + selection.width()
            && bbox.x() + bbox.width() > selection.x()
            && bbox.y() < selection.y() + selection.height()
            && bbox.y() + bbox.height() > selection.y();
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
            if (grids.get(i).id().equals(exerciseId)) {
                return new Interaction(exerciseId, "choice-grid", i, List.of());
            }
        }
        var orderings = analysis.sentenceOrderings();
        for (int i = 0; i < orderings.size(); i++) {
            if (orderings.get(i).id().equals(exerciseId)) {
                return new Interaction(exerciseId, "sentence-ordering", i,
                    orderings.get(i).nearbyTextSpanIds());
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
            .filter(e -> e.interactionIds().contains(exerciseId))
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
                var ordering = analysis.sentenceOrderings().stream()
                    .filter(o -> o.id().equals(interaction.id())).findFirst().orElse(null);
                yield ordering == null ? List.<String>of()
                    : ordering.items().stream().map(PageAnalysis.SentenceOrderingItem::text).toList();
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
