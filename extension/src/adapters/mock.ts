/**
 * Ratchet Privacy Shield — Local Mock Site Adapter
 *
 * Used for automated E2E and local round-trip testing.
 */

import type { SiteAdapter, ExtractedPrompt } from './types';

export class MockSiteAdapter implements SiteAdapter {
  siteName = 'MockChat';

  matchesPage(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  }

  matchesRequest(url: string, method?: string): boolean {
    if (method && method.toUpperCase() !== 'POST') return false;
    try {
      const base = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';
      const parsed = new URL(url, base);
      return parsed.pathname.includes('/api/chat');
    } catch {
      return url.includes('/api/chat');
    }
  }

  getConversationId(pageUrl: string): string | null {
    try {
      const parsed = new URL(pageUrl);
      const queryC = parsed.searchParams.get('c');
      if (queryC) return queryC;
      const match = parsed.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  extractUserPrompt(bodyString: string): ExtractedPrompt | null {
    try {
      const body = JSON.parse(bodyString);
      if (!body || typeof body !== 'object') return null;

      if (typeof body.prompt === 'string') {
        const originalPrompt = body.prompt;
        return {
          prompt: originalPrompt,
          replaceWith: (redactedPrompt: string) => {
            const updated = JSON.parse(bodyString);
            updated.prompt = redactedPrompt;
            return JSON.stringify(updated);
          },
        };
      }

      if (typeof body.message === 'string') {
        const originalPrompt = body.message;
        return {
          prompt: originalPrompt,
          replaceWith: (redactedPrompt: string) => {
            const updated = JSON.parse(bodyString);
            updated.message = redactedPrompt;
            return JSON.stringify(updated);
          },
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  getMessageSelectors(): string[] {
    return [
      '.assistant-message',
      '[data-role="assistant"]',
      '.chat-response',
    ];
  }
}
