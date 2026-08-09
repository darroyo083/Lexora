package com.lexora.book.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * TOC-derived structure of a physical workbook edition. Units are globally
 * numbered; each exercise page shows its unit number in the running header.
 */
public record BookProfile(
    UUID id,
    String publisher,
    String editionKey,
    int printedPageOffset,
    List<UnitRef> units,
    PageRange loesungenPdfRange,
    List<PageRange> nonUnitPrintedRanges
) {
    public BookProfile {
        units = units == null ? List.of() : List.copyOf(units);
        nonUnitPrintedRanges = nonUnitPrintedRanges == null
            ? List.of() : List.copyOf(nonUnitPrintedRanges);
    }

    public Optional<UnitRef> unit(int unitNumber) {
        for (var unit : units) {
            if (unit.unitNumber() == unitNumber) {
                return Optional.of(unit);
            }
        }
        return Optional.empty();
    }
}
