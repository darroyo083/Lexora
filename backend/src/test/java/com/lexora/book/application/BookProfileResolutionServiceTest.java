package com.lexora.book.application;

import com.lexora.book.domain.BookProfile;
import com.lexora.book.domain.PageRange;
import com.lexora.book.domain.UnitRef;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BookProfileResolutionServiceTest {

    private final BookProfile profile = BookProfileFixtures.syntheticProfile();
    private final BookProfileResolutionService service = new BookProfileResolutionService();

    @Test
    void printedPageOffsetAppliedToPdfPage() {
        assertThat(service.resolveUnit(profile, 1).map(unit -> unit.unitNumber())).contains(1);
        assertThat(service.resolveUnit(profile, 5).map(unit -> unit.unitNumber())).contains(2);
    }

    @Test
    void unitBoundaryIsStartInclusiveAndNextStartExclusive() {
        assertThat(service.resolveUnit(profile, 7).map(unit -> unit.unitNumber())).contains(2);
        assertThat(service.resolveUnit(profile, 8).map(unit -> unit.unitNumber())).contains(3);
    }

    @Test
    void pagesOutsideUnitsResolveEmpty() {
        assertThat(service.resolveUnit(profile, 0)).isEmpty();
        assertThat(service.resolveUnit(profile, 18)).isEmpty();
        assertThat(service.resolveUnit(profile, 30)).isEmpty();
    }

    @Test
    void configuredNonUnitRangesResolveEmpty() {
        assertThat(service.resolveUnit(profile, 3)).isEmpty();
        assertThat(service.resolveUnit(profile, 4)).isEmpty();
        assertThat(service.resolveUnit(profile, 10)).isEmpty();
        assertThat(service.resolveUnit(profile, 11)).isEmpty();
    }

    @Test
    void solutionSectionNeverResolvesToAUnit() {
        assertThat(service.resolveUnit(profile, 18)).isEmpty();
        assertThat(service.resolveUnit(profile, 20)).isEmpty();
    }

    @Test
    void pdfPagesForUnitExcludeConfiguredNonUnitRanges() {
        assertThat(service.pdfPagesForUnit(profile, 1, 20)).containsExactly(1, 2);
        assertThat(service.pdfPagesForUnit(profile, 2, 20)).containsExactly(5, 6, 7);
        assertThat(service.pdfPagesForUnit(profile, 3, 20)).containsExactly(8, 9);
    }

    @Test
    void lastUnitEndsBeforeSolutionSection() {
        assertThat(service.pdfPagesForUnit(profile, 4, 20)).containsExactly(12, 13, 14, 15, 16, 17);
    }

    @Test
    void pdfPagesForUnitClampToBookPageCount() {
        assertThat(service.pdfPagesForUnit(profile, 2, 5)).containsExactly(5);
        assertThat(service.pdfPagesForUnit(profile, 2, 4)).isEmpty();
    }

    @Test
    void solutionRangeIsExposed() {
        assertThat(service.loesungenPdfRange(profile).from()).isEqualTo(18);
        assertThat(service.loesungenPdfRange(profile).to()).isEqualTo(20);
    }

    @Test
    void publicDemoKeepsFourthWorkbookPageInsideItsFinalUnit() {
        var publicDemo = new BookProfile(
            UUID.fromString("b88fc22a-4f77-4e0f-9adb-00f9e2f066e8"),
            "Lexora",
            "lexora-public-demo-v1",
            0,
            List.of(
                new UnitRef(1, "Mein Morgen", 1),
                new UnitRef(2, "In der Stadt", 2),
                new UnitRef(3, "Ein Treffen planen", 3),
                new UnitRef(4, "Kleine Wiederholung", 4)
            ),
            new PageRange(5, 5),
            List.of()
        );

        assertThat(service.resolveUnit(publicDemo, 4).map(unit -> unit.unitNumber()))
            .contains(4);
        assertThat(service.pdfPagesForUnit(publicDemo, 4, 4)).containsExactly(4);
        assertThat(service.resolveUnit(publicDemo, 5)).isEmpty();
    }
}
