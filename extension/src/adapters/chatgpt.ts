/**
 * Ratchet Privacy Shield — ChatGPT Site Adapter
 *
 * Supports chatgpt.com and chat.openai.com.
 * Intercepts POST /backend-api/conversation.
 */

import type { SiteAdapter, ExtractedPrompt } from './types';

export class ChatGPTAdapter implements SiteAdapter {
  siteName = 'ChatGPT';

  matchesPage(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === 'chatgpt.com' || host === 'chat.openai.com' || host.endsWith('.chatgpt.com');
    } catch {
      return false;
    }
  }

  matchesRequest(url: string, method?: string): boolean {
    if (method && method.toUpperCase() !== 'POST') return false;
    try {
      const base = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://chatgpt.com';
      const parsed = new URL(url, base);
      return parsed.pathname.includes('/backend-api/conversation');
    } catch {
      return url.includes('/backend-api/conversation');
    }
  }

  getConversationId(pageUrl: string): string | null {
    try {
      const parsed = new URL(pageUrl);
      const match = parsed.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    } catch {
      const match = pageUrl.match(/\/c\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    }
  }

  extractUserPrompt(bodyString: string): ExtractedPrompt | null {
    try {
      const body = JSON.parse(bodyString);
      if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
        return null;
      }

      // Find the user message (typically the last message or one with author.role === 'user')
      let userMsgIndex = -1;
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const msg = body.messages[i];
        if (msg?.author?.role === 'user' && msg?.content && Array.isArray(msg.content.parts)) {
          userMsgIndex = i;
          break;
        }
      }

      if (userMsgIndex === -1) {
        return null;
      }

      const targetMsg = body.messages[userMsgIndex];
      const parts = targetMsg.content.parts;
      if (!Array.isArray(parts) || parts.length === 0 || typeof parts[0] !== 'string') {
        return null;
      }

      const originalPrompt = parts[0];

      return {
        prompt: originalPrompt,
        replaceWith: (redactedPrompt: string) => {
          // Clone and replace only the user prompt part, leaving all IDs, models, and metadata intact
          const updatedBody = JSON.parse(bodyString);
          updatedBody.messages[userMsgIndex].content.parts[0] = redactedPrompt;
          return JSON.stringify(updatedBody);
        },
      };
    } catch {
      return null;
    }
  }

  getMessageSelectors(): string[] {
    return [
      '[data-message-author-role="assistant"]',
      '[data-message-author-role="user"]',
      '.agent-turn',
      '.user-turn',
      '.markdown',
      'div[data-testid^="conversation-turn-"]',
    ];
  }
}
