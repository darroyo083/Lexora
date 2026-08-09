package com.lexora.book.application;

import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.PageRange;
import com.lexora.book.domain.UnitRef;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Resolves a PDF page number to the globally-numbered unit it belongs to,
 * using the TOC-derived BookProfile. Fail-closed: Partnerseiten pages,
 * the Lösungen section, and pages outside any unit resolve to empty.
 */
@Service
public class BookProfileResolutionService {

    /**
     * Resolves the unit whose printed range [printedStartPage, nextStart)
     * contains the given PDF page. Unit ranges never extend into the
     * Lösungen section, and non-unit printed ranges (e.g. Partnerseiten)
     * never resolve to a unit.
     */
    public Optional<UnitRef> resolveUnit(BookProfile profile, int pdfPageNumber) {
        var printed = pdfPageNumber + profile.printedPageOffset();
        if (printed < 1) {
            return Optional.empty();
        }
        var loesungenPrintedStart =
            profile.loesungenPdfRange().from() + profile.printedPageOffset();
        if (printed >= loesungenPrintedStart) {
            return Optional.empty();
        }
        for (var range : profile.nonUnitPrintedRanges()) {
            if (range.contains(printed)) {
                return Optional.empty();
            }
        }
        UnitRef best = null;
        for (var unit : profile.units()) {
            if (unit.printedStartPage() > printed) {
                break;
            }
            best = unit;
        }
        return Optional.ofNullable(best);
    }

    public PageRange loesungenPdfRange(BookProfile profile) {
        return profile.loesungenPdfRange();
    }

    /**
     * PDF pages belonging to the unit, ascending. The last unit ends where the
     * Lösungen section starts; non-unit printed ranges are excluded.
     */
    public List<Integer> pdfPagesForUnit(BookProfile profile, int unitNumber, int bookPageCount) {
        var units = profile.units();
        for (int i = 0; i < units.size(); i++) {
            var unit = units.get(i);
            if (unit.unitNumber() != unitNumber) {
                continue;
            }
            var end = i + 1 < units.size()
                ? units.get(i + 1).printedStartPage()
                : profile.loesungenPdfRange().from() + profile.printedPageOffset();
            var pages = new ArrayList<Integer>();
            for (int printed = unit.printedStartPage(); printed < end; printed++) {
                if (isNonUnitPage(profile, printed)) {
                    continue;
                }
                var pdf = printed - profile.printedPageOffset();
                if (pdf >= 1 && pdf <= bookPageCount) {
                    pages.add(pdf);
                }
            }
            return List.copyOf(pages);
        }
        return List.of();
    }

    private static boolean isNonUnitPage(BookProfile profile, int printedPageNumber) {
        for (var range : profile.nonUnitPrintedRanges()) {
            if (range.contains(printedPageNumber)) {
                return true;
            }
        }
        return false;
    }
}
