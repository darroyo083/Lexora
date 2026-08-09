package com.lexora.book.application;

import com.lexora.book.domain.BookProfile;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BookProfileResolutionServiceTest {

    private final BookProfile profile = BookProfileFixtures.realGrammatikAktivProfile();
    private final BookProfileResolutionService service = new BookProfileResolutionService();

    @Test
    void printedPageOffsetAppliedToPdfPage() {
        assertThat(service.resolveUnit(profile, 8).map(u -> u.unitNumber())).contains(2);
        assertThat(service.resolveUnit(profile, 194).map(u -> u.unitNumber())).contains(85);
    }

    @Test
    void unit1Boundary() {
        assertThat(service.resolveUnit(profile, 6).map(u -> u.unitNumber())).contains(1);
        assertThat(service.resolveUnit(profile, 5)).isEmpty();
    }

    @Test
    void middleUnitsResolve() {
        assertThat(service.resolveUnit(profile, 12).map(u -> u.unitNumber())).contains(4);
        assertThat(service.resolveUnit(profile, 76).map(u -> u.unitNumber())).contains(32);
    }

    @Test
    void lateUnitsResolve() {
        assertThat(service.resolveUnit(profile, 180).map(u -> u.unitNumber())).contains(79);
        assertThat(service.resolveUnit(profile, 182).map(u -> u.unitNumber())).contains(80);
        assertThat(service.resolveUnit(profile, 184).map(u -> u.unitNumber())).contains(81);
        assertThat(service.resolveUnit(profile, 194).map(u -> u.unitNumber())).contains(85);
    }

    @Test
    void unitRangesAreStartToNextStartExclusive() {
        assertThat(service.resolveUnit(profile, 8).map(u -> u.unitNumber())).contains(2);
        assertThat(service.resolveUnit(profile, 9).map(u -> u.unitNumber())).contains(2);
        assertThat(service.resolveUnit(profile, 10).map(u -> u.unitNumber())).contains(3);
    }

    @Test
    void irregularSpacingRespectsRealPageGaps() {
        assertThat(service.resolveUnit(profile, 67).map(u -> u.unitNumber())).contains(29);
        assertThat(service.resolveUnit(profile, 68).map(u -> u.unitNumber())).contains(30);
        assertThat(service.resolveUnit(profile, 75).map(u -> u.unitNumber())).contains(31);
        assertThat(service.resolveUnit(profile, 76).map(u -> u.unitNumber())).contains(32);
    }

    @Test
    void pagesOutsideAnyUnitResolveEmpty() {
        assertThat(service.resolveUnit(profile, 1)).isEmpty();
        assertThat(service.resolveUnit(profile, 231)).isEmpty();
        assertThat(service.resolveUnit(profile, 256)).isEmpty();
    }

    @Test
    void nonUnitPartnerseitenResolveEmpty() {
        assertThat(service.resolveUnit(profile, 24)).isEmpty();
        assertThat(service.resolveUnit(profile, 25)).isEmpty();
        assertThat(service.resolveUnit(profile, 154)).isEmpty();
        assertThat(service.resolveUnit(profile, 155)).isEmpty();
        assertThat(service.resolveUnit(profile, 186)).isEmpty();
        assertThat(service.resolveUnit(profile, 187)).isEmpty();
        assertThat(service.resolveUnit(profile, 196)).isEmpty();
        assertThat(service.resolveUnit(profile, 197)).isEmpty();
    }

    @Test
    void loesungenSectionNeverResolvesToAUnit() {
        assertThat(service.resolveUnit(profile, 198)).isEmpty();
        assertThat(service.resolveUnit(profile, 230)).isEmpty();
    }

    @Test
    void pdfPagesForUnitFollowPrintedRanges() {
        assertThat(service.pdfPagesForUnit(profile, 2, 256)).containsExactly(8, 9);
        assertThat(service.pdfPagesForUnit(profile, 29, 256)).containsExactly(67);
        assertThat(service.pdfPagesForUnit(profile, 31, 256)).containsExactly(70, 71, 72, 73, 74, 75);
        assertThat(service.pdfPagesForUnit(profile, 32, 256)).containsExactly(76, 77);
    }

    @Test
    void pdfPagesForLastUnitEndsBeforeLoesungenAndExcludesPartnerseiten() {
        assertThat(service.pdfPagesForUnit(profile, 85, 256)).containsExactly(194, 195);
    }

    @Test
    void pdfPagesForUnitClampedToBookPageCount() {
        assertThat(service.pdfPagesForUnit(profile, 2, 8)).containsExactly(8);
        assertThat(service.pdfPagesForUnit(profile, 2, 7)).isEmpty();
    }

    @Test
    void loesungenPdfRangeExposed() {
        assertThat(service.loesungenPdfRange(profile).from()).isEqualTo(198);
        assertThat(service.loesungenPdfRange(profile).to()).isEqualTo(230);
    }
}
