import { describe, expect, it } from 'vitest';
import { canonicalPathname, resolveRoute } from '../routing';

describe('route resolution', () => {
  it('keeps valid landing and demo routes', () => {
    expect(resolveRoute('/')).toMatchObject({ pathname: '/', surface: 'landing', replace: false });
    expect(resolveRoute('/product/')).toMatchObject({ pathname: '/product', surface: 'landing', replace: false });
    expect(resolveRoute('/demo')).toMatchObject({ pathname: '/demo', surface: 'reader', replace: false });
    expect(resolveRoute('/demo/')).toMatchObject({ pathname: '/demo', surface: 'reader', replace: false });
  });

  it('redirects unknown paths to the landing page', () => {
    expect(resolveRoute('/does-not-exist')).toMatchObject({ pathname: '/', surface: 'landing', replace: true });
    expect(resolveRoute('/foo/bar')).toMatchObject({ pathname: '/', surface: 'landing', replace: true });
  });

  it('preserves the legacy engineering alias as a replacement route', () => {
    expect(resolveRoute('/engineering')).toMatchObject({ pathname: '/inside-lexora', replace: true });
  });

  it('normalizes repeated trailing slashes', () => {
    expect(canonicalPathname('///')).toBe('/');
    expect(canonicalPathname('/foo/bar///')).toBe('/foo/bar');
  });
});
