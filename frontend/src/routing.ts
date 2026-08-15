export type Surface = 'landing' | 'reader';

export const landingPaths = ['/', '/product', '/how-it-works', '/inside-lexora'] as const;

type LandingPath = typeof landingPaths[number];

export type ResolvedRoute = {
  pathname: '/demo' | LandingPath;
  surface: Surface;
  replace: boolean;
};

export function canonicalPathname(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function resolveRoute(pathname: string): ResolvedRoute {
  const path = canonicalPathname(pathname);

  if (path === '/demo') {
    return { pathname: '/demo', surface: 'reader', replace: false };
  }

  if (path === '/engineering') {
    return { pathname: '/inside-lexora', surface: 'landing', replace: true };
  }

  if ((landingPaths as readonly string[]).includes(path)) {
    return { pathname: path as LandingPath, surface: 'landing', replace: false };
  }

  return { pathname: '/', surface: 'landing', replace: true };
}
