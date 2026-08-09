package com.lexora.correction.application;

import com.lexora.book.application.BookProfileResolutionService;
import com.lexora.book.application.BookService;
import com.lexora.book.infrastructure.BookProfileRepository;
import com.lexora.correction.domain.AnswerKey;
import com.lexora.correction.domain.AnswerKeyEntry;
import com.lexora.correction.domain.CorrectionSlot;
import com.lexora.correction.domain.PageCorrectionResolution;
import com.lexora.correction.domain.ResolvedAnswerEntry;
import com.lexora.documentanalysis.contract.PageAnalysis;
import com.lexora.shared.error.BookNotFoundException;
import com.lexora.shared.error.PageNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Deterministic, fail-closed association of answer-key entries to page
 * interactions: a page resolves to a unit via the BookProfile, the unit's
 * entries (one answer block each) consume the unit's interactions of the
 * matching kind in page order, and the requested page's slots are reported.
 * Never grades — grading stays in CorrectionEngine.
 */
@Service
public class CorrectionResolutionService {

    private static final Logger log = LoggerFactory.getLogger(CorrectionResolutionService.class);
    private static final JsonMapper JSON = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

    static final List<String> KIND_ORDER = List.of(
        "fill-in-line", "choice", "choice-grid",
        "sentence-ordering", "matching", "free-text"
    );

    private static final Map<String, String> PARSER_KIND_TO_FRONTEND = Map.of(
        "FillBlank", "fill-in-line",
        "Matching", "matching",
        "Choice", "choice",
        "ChoiceGrid", "choice-grid",
        "SentenceOrdering", "sentence-ordering",
        "FreeText", "free-text"
    );

    private final BookService bookService;
    private final BookProfileRepository bookProfileRepository;
    private final BookProfileResolutionService profileResolution;
    private final AnswerKeyService answerKeyService;

    public CorrectionResolutionService(BookService bookService,
                                       BookProfileRepository bookProfileRepository,
                                       BookProfileResolutionService profileResolution,
                                       AnswerKeyService answerKeyService) {
        this.bookService = bookService;
        this.bookProfileRepository = bookProfileRepository;
        this.profileResolution = profileResolution;
        this.answerKeyService = answerKeyService;
    }

    public PageCorrectionResolution resolve(UUID bookId, int pdfPageNumber) {
        var book = bookService.getBook(bookId)
            .orElseThrow(() -> new BookNotFoundException(bookId));
        if (pdfPageNumber < 1 || pdfPageNumber > book.pageCount()) {
            throw new PageNotFoundException(bookId, pdfPageNumber);
        }

        if (book.bookProfileId() == null) {
            return PageCorrectionResolution.unmapped(bookId, pdfPageNumber, null);
        }
        var profile = bookProfileRepository.findById(book.bookProfileId()).orElse(null);
        if (profile == null) {
            return PageCorrectionResolution.unmapped(bookId, pdfPageNumber, null);
        }

        var unit = profileResolution.resolveUnit(profile, pdfPageNumber).orElse(null);
        if (unit == null) {
            return PageCorrectionResolution.unmapped(bookId, pdfPageNumber, null);
        }

        var key = answerKeyService.findAnswerKey(bookId).orElse(null);
        if (key == null) {
            return PageCorrectionResolution.unmapped(bookId, pdfPageNumber, unit.unitNumber());
        }

        var entries = unitEntries(key, unit.unitNumber());
        if (entries.isEmpty()) {
            return PageCorrectionResolution.unmapped(bookId, pdfPageNumber, unit.unitNumber());
        }

        var requestedAnalysis = loadAnalysis(bookId, pdfPageNumber);
        var unitPdfPages = profileResolution.pdfPagesForUnit(profile, unit.unitNumber(), book.pageCount());

        var slots = new ArrayList<CorrectionSlot>();
        for (var frontendKind : KIND_ORDER) {
            slots.addAll(resolveKind(bookId, frontendKind, entries, unitPdfPages,
                pdfPageNumber, requestedAnalysis));
        }

        var status = statusOf(slots);
        return new PageCorrectionResolution(bookId, pdfPageNumber, status,
            unit.unitNumber(), List.copyOf(slots));
    }

    private static List<AnswerKeyEntry> unitEntries(AnswerKey key, int unitNumber) {
        return key.entries().stream()
            .filter(e -> e.unitNumber() != null && e.unitNumber() == unitNumber)
            .sorted(Comparator.comparing(AnswerKeyEntry::subExerciseMarker,
                    Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparingInt(AnswerKeyEntry::ordinal))
            .toList();
    }

    private List<CorrectionSlot> resolveKind(UUID bookId, String frontendKind,
                                             List<AnswerKeyEntry> entries,
                                             List<Integer> unitPdfPages,
                                             int requestedPageNumber,
                                             Optional<PageAnalysis> requestedAnalysis) {
        var parserKind = parserKindFor(frontendKind);
        var kindEntries = entries.stream()
            .filter(e -> parserKind.equals(e.interactionKind()))
            .toList();

        var interactions = new ArrayList<InteractionRef>();
        for (var pdfPage : unitPdfPages) {
            var analysis = loadAnalysis(bookId, pdfPage);
            if (analysis.isEmpty()) {
                continue;
            }
            var count = interactionCount(analysis.get(), frontendKind);
            for (int i = 0; i < count; i++) {
                interactions.add(new InteractionRef(pdfPage, i));
            }
        }

        var resolutionByIndex = consume(interactions.size(), kindEntries);

        var slots = new ArrayList<CorrectionSlot>();
        var requested = requestedAnalysis.orElse(null);
        if (requested == null) {
            return slots;
        }
        var requestedCount = interactionCount(requested, frontendKind);
        for (int i = 0; i < requestedCount; i++) {
            int index = interactionIndex(interactions, requestedPageNumber, i);
            if (index < 0 || !resolutionByIndex.containsKey(index)) {
                slots.add(new CorrectionSlot(frontendKind, i, PageCorrectionResolution.UNMAPPED, null));
                continue;
            }
            var entry = resolutionByIndex.get(index);
            if (entry == null) {
                slots.add(new CorrectionSlot(frontendKind, i, PageCorrectionResolution.AMBIGUOUS, null));
            } else {
                slots.add(new CorrectionSlot(frontendKind, i, PageCorrectionResolution.RESOLVED, entry));
            }
        }
        return slots;
    }

    /**
     * Walks the unit's entries of one kind in order; each entry is ONE answer
     * block consuming itemCount interactions. Blocks are never partially
     * applied: when fewer interactions remain than itemCount, the remaining
     * interactions are AMBIGUOUS (fail-closed, no guessing or skipping ahead).
     * Interactions beyond all blocks stay UNMAPPED (absent from the map).
     */
    private static Map<Integer, ResolvedAnswerEntry> consume(int interactionCount,
                                                             List<AnswerKeyEntry> entries) {
        var result = new HashMap<Integer, ResolvedAnswerEntry>();
        int cursor = 0;
        for (var entry : entries) {
            int itemCount = entry.items().isEmpty() ? 1 : entry.items().size();
            if (cursor + itemCount > interactionCount) {
                for (int i = cursor; i < interactionCount; i++) {
                    result.put(i, null);
                }
                break;
            }
            for (int i = 0; i < itemCount; i++) {
                var view = entry.items().isEmpty()
                    ? ResolvedAnswerEntry.single(entry)
                    : ResolvedAnswerEntry.item(entry, i);
                // Unreadable OCR characters can never be authoritative:
                // fail closed (AMBIGUOUS) instead of grading against garbage.
                if (view.expectedValue().indexOf('\uFFFD') >= 0) {
                    result.put(cursor + i, null);
                } else {
                    result.put(cursor + i, view);
                }
            }
            cursor += itemCount;
        }
        return result;
    }

    private static int interactionIndex(List<InteractionRef> interactions,
                                        int pdfPage, int ordinalOnPage) {
        int index = 0;
        for (var interaction : interactions) {
            if (interaction.pdfPage() == pdfPage && interaction.ordinalOnPage() == ordinalOnPage) {
                return index;
            }
            index++;
        }
        return -1;
    }

    private Optional<PageAnalysis> loadAnalysis(UUID bookId, int pdfPage) {
        var page = bookService.getPage(bookId, pdfPage).orElse(null);
        if (page == null || page.analysis() == null || page.analysis().isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(JSON.readValue(page.analysis(), PageAnalysis.class));
        } catch (Exception e) {
            log.warn("failed to deserialize page analysis bookId={} page={}", bookId, pdfPage, e);
            return Optional.empty();
        }
    }

    private static int interactionCount(PageAnalysis analysis, String frontendKind) {
        return switch (frontendKind) {
            case "fill-in-line" -> (int) analysis.exerciseBlanks().stream()
                .filter(b -> "fill-in-line".equals(b.kind())).count();
            case "choice" -> analysis.choiceTargets().size();
            case "choice-grid" -> analysis.choiceGrids().size();
            case "sentence-ordering" -> analysis.sentenceOrderings().size();
            case "matching" -> analysis.matchingInteractions().size();
            case "free-text" -> analysis.freeTextInteractions().size();
            default -> 0;
        };
    }

    private static String parserKindFor(String frontendKind) {
        for (var entry : PARSER_KIND_TO_FRONTEND.entrySet()) {
            if (entry.getValue().equals(frontendKind)) {
                return entry.getKey();
            }
        }
        return frontendKind;
    }

    private static String statusOf(List<CorrectionSlot> slots) {
        for (var slot : slots) {
            if (PageCorrectionResolution.RESOLVED.equals(slot.resolution())) {
                return PageCorrectionResolution.RESOLVED;
            }
        }
        for (var slot : slots) {
            if (PageCorrectionResolution.AMBIGUOUS.equals(slot.resolution())) {
                return PageCorrectionResolution.AMBIGUOUS;
            }
        }
        return PageCorrectionResolution.UNMAPPED;
    }

    private record InteractionRef(int pdfPage, int ordinalOnPage) {}
}
