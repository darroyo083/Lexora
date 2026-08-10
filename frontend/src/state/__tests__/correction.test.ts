import { describe, expect, it } from 'vitest';
import type { ChoiceGrid } from '../../reader/types';
import { readRevealBitsForPage, writeRevealBit } from '../correction';

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

const grid: ChoiceGrid = {
  id: 'grid-1',
  kind: 'choice-grid',
  gridBbox: { x: 0.1, y: 0.2, width: 0.7, height: 0.2 },
  optionGroupId: 'options',
  detectionMethod: 'table-grid-v1',
  candidateScore: 0.9,
  rows: [{
    id: 'row-1',
    rowBbox: { x: 0.1, y: 0.2, width: 0.7, height: 0.05 },
    promptBbox: null,
    nearbyTextSpanIds: [],
    cells: [],
  }],
};

describe('correction reveal persistence', () => {
  it('restores both aggregate grid and row reveal identities', () => {
    const storage = memoryStorage();
    writeRevealBit('book-1', 12, 'grid-1', true, storage);
    writeRevealBit('book-1', 12, 'row-1', true, storage);

    expect(readRevealBitsForPage(
      'book-1', 12, [], [], [grid], [], [], [], '1.4', storage,
    )).toEqual({ 'grid-1': true, 'row-1': true });
  });
});
