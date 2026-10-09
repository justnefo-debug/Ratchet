/**
 * Ratchet Privacy Shield — Claude Site Adapter
 *
 * Supports claude.ai.
 * Intercepts POST requests to /api/organizations/.../chat_conversations/...
 */

import type { SiteAdapter, ExtractedPrompt } from './types';

export class ClaudeAdapter implements SiteAdapter {
  siteName = 'Claude';

  matchesPage(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === 'claude.ai' || host.endsWith('.claude.ai');
    } catch {
      return false;
    }
  }

  matchesRequest(url: string, method?: string): boolean {
    if (method && method.toUpperCase() !== 'POST') return false;
    try {
      const base = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://claude.ai';
      const parsed = new URL(url, base);
      const path = parsed.pathname;
      return (
        path.includes('/api/organizations/') &&
        path.includes('/chat_conversations/') &&
        (path.endsWith('/completion') || path.endsWith('/retry_completion') || path.includes('/completion'))
      );
    } catch {
      return (
        url.includes('/api/organizations/') &&
        url.includes('/chat_conversations/')
      );
    }
  }

  getConversationId(pageUrl: string): string | null {
    try {
      const parsed = new URL(pageUrl);
      const match = parsed.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    } catch {
      const match = pageUrl.match(/\/chat\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    }
  }

  extractUserPrompt(bodyString: string): ExtractedPrompt | null {
    try {
      const body = JSON.parse(bodyString);
      if (!body || typeof body !== 'object') return null;

      // Schema 1: Direct prompt string field
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

      // Schema 2: messages array format
      if (Array.isArray(body.messages)) {
        let userIdx = -1;
        for (let i = body.messages.length - 1; i >= 0; i--) {
          const m = body.messages[i];
          if (m?.role === 'user') {
            userIdx = i;
            break;
          }
        }

        if (userIdx === -1) return null;

        const userMsg = body.messages[userIdx];

        // Format 2a: content is string
        if (typeof userMsg.content === 'string') {
          return {
            prompt: userMsg.content,
            replaceWith: (redactedPrompt: string) => {
              const updated = JSON.parse(bodyString);
              updated.messages[userIdx].content = redactedPrompt;
              return JSON.stringify(updated);
            },
          };
        }

        // Format 2b: content is array of blocks [{ type: "text", text: "..." }]
        if (Array.isArray(userMsg.content) && typeof userMsg.content[0]?.text === 'string') {
          return {
            prompt: userMsg.content[0].text,
            replaceWith: (redactedPrompt: string) => {
              const updated = JSON.parse(bodyString);
              updated.messages[userIdx].content[0].text = redactedPrompt;
              return JSON.stringify(updated);
            },
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  getMessageSelectors(): string[] {
    return [
      '[data-is-streaming]',
      '.font-claude-message',
      '.font-user-message',
      'div[data-testid="user-message"]',
      'div[data-test-render-count]',
      '.standard-markdown',
      'div[class*="ChatMessage"]',
    ];
  }
}
