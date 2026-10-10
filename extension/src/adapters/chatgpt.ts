/**
 * Ratchet Privacy Shield — ChatGPT Site Adapter
 *
 * Supports chatgpt.com and chat.openai.com.
 * Intercepts POST /backend-api/conversation.
 */

import type { SiteAdapter, ExtractedPrompt, RequestClassification } from './types';

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

  matchesRequest(_url: string, method?: string): boolean {
    if (method && method.toUpperCase() !== 'POST') return false;
    return true;
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
      let foundUserMessage = false;

      for (const m of body.messages) {
        if (m?.author?.role === 'user') {
          foundUserMessage = true;
          if (!m.content || !Array.isArray(m.content.parts)) {
            return null; // user message lacks content.parts array
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
      if (!body || typeof body !== 'object') {
        return { classification: 'non-message', extracted: null };
      }

      // If the body has a 'messages' key, it looks like a message request
      if ('messages' in body) {
        if (!Array.isArray(body.messages)) {
          // messages exists but is not an array → unexpected shape, fail closed
          return { classification: 'unknown-message-shape', extracted: null };
        }

        // Try to extract the user prompt
        const extracted = this.extractUserPrompt(bodyString);
        if (extracted) {
          return { classification: 'message', extracted };
        }

        // messages array exists but we couldn't extract a valid user message → fail closed
        return { classification: 'unknown-message-shape', extracted: null };
      }

      // No messages key → non-message request (e.g., prepare, metadata)
      return { classification: 'non-message', extracted: null };
    } catch {
      // Invalid JSON → treat as non-message (safety net will scan raw string)
      return { classification: 'non-message', extracted: null };
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
