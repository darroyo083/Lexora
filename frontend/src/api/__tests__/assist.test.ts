import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAssistConfig, requestAssist } from '../assist';

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAssistConfig', () => {
  it('returns enabled and siteKey from the config endpoint', async () => {
    stubFetch(() => new Response(JSON.stringify({
      enabled: true,
      siteKey: 'site-key',
      sessionQuota: { used: 3, limit: 10, remaining: 7 },
    })));
    const config = await fetchAssistConfig();
    expect(config).toEqual({
      enabled: true,
      siteKey: 'site-key',
      sessionQuota: { used: 3, limit: 10, remaining: 7 },
    });
  });

  it('falls back to disabled on a non-ok response', async () => {
    stubFetch(() => new Response('nope', { status: 500 }));
    const config = await fetchAssistConfig();
    expect(config).toEqual({ enabled: false, siteKey: null, sessionQuota: null });
  });
});

describe('requestAssist', () => {
  it('POSTs the strict payload to /api/ai/assist', async () => {
    const fn = stubFetch(() => new Response(
      JSON.stringify({ action: 'hint', status: 'success', content: 'A hint', verdict: null, cached: false, siteKey: null, message: null, sessionQuota: { used: 4, limit: 10, remaining: 6 } }),
    ));
    const response = await requestAssist({
      action: 'hint',
      bookId: 'book',
      pageNumber: 2,
      exerciseId: 'blank-01',
      answer: null,
      targetLanguage: null,
      turnstileToken: null,
    });

    expect(response.status).toBe('success');
    expect(response.content).toBe('A hint');
    expect(response.sessionQuota).toEqual({ used: 4, limit: 10, remaining: 6 });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/ai/assist');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe('hint');
    expect(body.exerciseId).toBe('blank-01');
    expect(body.turnstileToken).toBeNull();
  });

  it('throws on a non-ok response', async () => {
    stubFetch(() => new Response('error', { status: 500 }));
    await expect(requestAssist({
      action: 'hint',
      bookId: 'book',
      pageNumber: 1,
      exerciseId: 'x',
      answer: null,
      targetLanguage: null,
      turnstileToken: null,
    })).rejects.toThrow();
  });
});
