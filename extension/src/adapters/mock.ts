/**
 * Ratchet Privacy Shield — Local Mock Site Adapter
 *
 * Used for automated E2E and local round-trip testing.
 */

import type { SiteAdapter, ExtractedPrompt, RequestClassification } from './types';

export class MockSiteAdapter implements SiteAdapter {
  siteName = 'MockChat';

  matchesPage(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return typeof __TEST_BUILD__ !== 'undefined' && __TEST_BUILD__ && (host === 'localhost' || host === '127.0.0.1');
    } catch {
      return false;
    }
  }

  matchesRequest(_url: string, method?: string): boolean {
    if (method && method.toUpperCase() !== 'POST') return false;
    return true;
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

      let foundUserMessage = false;

      for (const m of body.messages) {
        if (m?.author?.role === 'user') {
          foundUserMessage = true;
          if (!m.content || !Array.isArray(m.content.parts)) {
            return null;
          }
        }
      }

      if (!foundUserMessage) {
        return null;
      }

      const stringParts: { msgIndex: number; partIndex: number; text: string }[] = [];
      for (let i = 0; i < body.messages.length; i++) {
        const m = body.messages[i];
        if (m?.author?.role === 'user') {
          for (let j = 0; j < m.content.parts.length; j++) {
            if (typeof m.content.parts[j] === 'string') {
              stringParts.push({ msgIndex: i, partIndex: j, text: m.content.parts[j] });
            }
          }
        }
      }

      if (stringParts.length === 0) {
        return null;
      }

      const joinedPrompt = stringParts.map(sp => sp.text).join('\n\n');

      return {
        prompt: joinedPrompt,
        replaceWith: (redactedPrompt: string) => {
          const newBody = JSON.parse(bodyString);
          if (stringParts.length === 1) {
            const sp = stringParts[0];
            newBody.messages[sp.msgIndex].content.parts[sp.partIndex] = redactedPrompt;
          } else {
            const first = stringParts[0];
            newBody.messages[first.msgIndex].content.parts[first.partIndex] = redactedPrompt;
            for (let i = 1; i < stringParts.length; i++) {
              const sp = stringParts[i];
              newBody.messages[sp.msgIndex].content.parts[sp.partIndex] = '';
            }
          }
          return JSON.stringify(newBody);
        }
      };
    } catch {
      return null;
    }
  }

  classifyRequest(bodyString: string): { classification: RequestClassification; extracted: ExtractedPrompt | null } {
    try {
      const body = JSON.parse(bodyString);
      if (body && typeof body === 'object' && 'messages' in body) {
        if (!Array.isArray(body.messages)) {
          return { classification: 'unknown-message-shape', extracted: null };
        }
        const extracted = this.extractUserPrompt(bodyString);
        if (extracted) {
          return { classification: 'message', extracted };
        }
        return { classification: 'unknown-message-shape', extracted: null };
      }
    } catch {}
    return { classification: 'non-message', extracted: null };
  }

  getMessageSelectors(): string[] {
    return [
      '.assistant-message',
      '.user-message',
      '[data-role="assistant"]',
      '[data-role="user"]',
      '.chat-response',
    ];
  }
}
