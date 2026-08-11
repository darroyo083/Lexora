import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAnswerKey, fetchPageCorrection } from '../correction';

const matchingEntry = {
  pageNumber: 2,
  interactionKind: 'matching',
  ordinal: 0,
  expectedValue: '1-C',
  alternatives: [],
  caseSensitive: false,
  punctuationRequired: false,
  normalizationMode: 'strict',
  rawSolutionText: '',
  confidence: 1,
  mappingWarnings: [],
  typedPayload: {
    type: 'Matching',
    pairs: [{ leftLabel: 'die Bäckerei', rightLabel: 'Brot' }],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('correction API payload normalization', () => {
  it('normalizes the backend Jackson type discriminator for answer keys', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'key', bookId: 'book', entries: [matchingEntry] }),
    }));

    const key = await fetchAnswerKey('book');

    expect(key.entries[0].typedPayload).toEqual({
      kind: 'matching',
      pairs: [{ leftLabel: 'die Bäckerei', rightLabel: 'Brot' }],
    });
  });

  it('normalizes entries nested in page-correction slots', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bookId: 'book',
        pageNumber: 2,
        unitNumber: 2,
        unitTitle: 'In der Stadt',
        status: 'RESOLVED',
        slots: [{ interactionKind: 'matching', ordinal: 0, resolution: 'RESOLVED', entry: matchingEntry }],
      }),
    }));

    const correction = await fetchPageCorrection('book', 2);

    expect(correction.slots[0].entry?.typedPayload?.kind).toBe('matching');
  });
});
