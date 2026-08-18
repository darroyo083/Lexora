import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nginxConfig = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');
const askLexoraSource = readFileSync(new URL('../components/AskLexora.tsx', import.meta.url), 'utf8');

function contentSecurityPolicy(): string {
  const match = nginxConfig.match(/Content-Security-Policy "([^"]+)"/);
  if (!match) throw new Error('Production CSP header is missing');
  return match[1];
}

function directive(policy: string, name: string): string {
  const value = policy.split(';').find((entry) => entry.trim().startsWith(`${name} `));
  if (!value) throw new Error(`Production CSP directive is missing: ${name}`);
  return value.trim();
}

describe('production CSP', () => {
  it('allows only the official Turnstile origin for scripts and frames', () => {
    const policy = contentSecurityPolicy();
    const scriptSource = directive(policy, 'script-src');
    const frameSource = directive(policy, 'frame-src');

    expect(scriptSource).toBe("script-src 'self' https://challenges.cloudflare.com");
    expect(frameSource).toBe("frame-src 'self' https://challenges.cloudflare.com");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain('unsafe-eval');
    expect(scriptSource).not.toContain('*');
    expect(frameSource).not.toContain('*');
  });

  it('keeps the Turnstile script on Cloudflare’s official endpoint', () => {
    expect(askLexoraSource).toContain(
      "const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';",
    );
    expect(askLexoraSource).not.toMatch(/TURNSTILE_SCRIPT\s*=\s*['"](?!https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js)/);
  });
});
