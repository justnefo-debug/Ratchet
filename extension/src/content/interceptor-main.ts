/**
 * Ratchet Privacy Shield — MAIN-World Network Interceptor
 *
 * Injected at document_start in the MAIN world.
 * Wraps window.fetch and XMLHttpRequest for target AI endpoints.
 * Relays user prompts to the ISOLATED content script for redaction.
 * Enforces strict fail-closed security: if redaction fails or times out,
 * the outgoing request is blocked and never sent.
 * NEVER logs raw prompts, mappings, or restored text.
 */

import { getAdapterForUrl } from '../adapters';
import { showPrivacyNotice, showWarningNotice } from './ui-notice';

(() => {
  const adapter = getAdapterForUrl(window.location.href);
  if (!adapter) {
    return;
  }

  // Temporary conversation key for new chats
  let tempConvId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function getConversationId(): string {
    const realId = adapter?.getConversationId(window.location.href);
    if (realId) return realId;
    return tempConvId;
  }

  /**
   * Request-ID based communication channel with ISOLATED content script.
   */
  function requestRedaction(prompt: string, convId: string, timeoutMs = 4000): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const handler = (evt: MessageEvent) => {
        if (evt.source !== window || !evt.data || evt.data.source !== 'RATCHET_ISOLATED') {
          return;
        }

        if (evt.data.requestId === requestId) {
          if (timer) clearTimeout(timer);
          window.removeEventListener('message', handler);

          if (evt.data.success && typeof evt.data.redactedText === 'string') {
            if (Array.isArray(evt.data.warnings)) {
              for (const warn of evt.data.warnings) {
                showWarningNotice(warn);
              }
            }
            resolve(evt.data.redactedText);
          } else {
            reject(new Error(evt.data.error || 'Redaction failed'));
          }
        }
      };

      window.addEventListener('message', handler);

      timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Redaction request timed out'));
      }, timeoutMs);

      window.postMessage(
        {
          source: 'RATCHET_MAIN',
          requestId,
          type: 'REDACT_REQUEST',
          text: prompt,
          conversationId: convId,
        },
        '*',
      );
    });
  }

  // ─── 1. Wrap window.fetch ─────────────────────────────────────────

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = '';
    let method = 'GET';

    if (typeof input === 'string') {
      url = input;
      method = init?.method?.toUpperCase() || 'GET';
    } else if (input instanceof URL) {
      url = input.toString();
      method = init?.method?.toUpperCase() || 'GET';
    } else if (input instanceof Request) {
      url = input.url;
      method = input.method?.toUpperCase() || 'GET';
    }

    if (!adapter.matchesRequest(url, method)) {
      return originalFetch.apply(this, arguments as any);
    }

    let rawBody: string | null = null;
    if (init && typeof init.body === 'string') {
      rawBody = init.body;
    } else if (input instanceof Request) {
      try {
        rawBody = await input.clone().text();
      } catch {
        rawBody = null;
      }
    }

    if (!rawBody) {
      showPrivacyNotice('Ratchet: Outgoing request blocked (unreadable payload).');
      throw new Error('[Ratchet] Outgoing request blocked (unreadable payload)');
    }

    const extracted = adapter.extractUserPrompt(rawBody);
    if (!extracted) {
      showPrivacyNotice('Ratchet: Outgoing request blocked (unrecognized message schema).');
      throw new Error('[Ratchet] Outgoing request blocked (unrecognized message schema)');
    }

    const convId = getConversationId();
    let redactedText: string;

    try {
      redactedText = await requestRedaction(extracted.prompt, convId);
    } catch {
      showPrivacyNotice('Ratchet: Outgoing request blocked (redaction failed or timed out).');
      throw new Error('[Ratchet] Outgoing request blocked (redaction failed or timed out)');
    }

    const newBody = extracted.replaceWith(redactedText);

    if (init) {
      init = { ...init, body: newBody };
      return originalFetch.call(this, input, init);
    } else if (input instanceof Request) {
      const newReq = new Request(input, { body: newBody });
      return originalFetch.call(this, newReq);
    } else {
      return originalFetch.call(this, input, { body: newBody, method: 'POST' });
    }
  };

  // ─── 2. Wrap XMLHttpRequest ──────────────────────────────────────

  const OriginalXHR = window.XMLHttpRequest;
  const originalOpen = OriginalXHR.prototype.open;
  const originalSend = OriginalXHR.prototype.send;

  OriginalXHR.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: any[]
  ) {
    (this as any).__ratchet_method = method;
    (this as any).__ratchet_url = typeof url === 'string' ? url : url.toString();
    return originalOpen.apply(this, [method, url, ...rest] as any);
  };

  OriginalXHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const method = (this as any).__ratchet_method || 'GET';
    const url = (this as any).__ratchet_url || '';

    if (!adapter.matchesRequest(url, method)) {
      return originalSend.apply(this, arguments as any);
    }

    if (typeof body !== 'string') {
      showPrivacyNotice('Ratchet: Outgoing request blocked (non-string payload).');
      throw new Error('[Ratchet] Outgoing request blocked (non-string payload)');
    }

    const extracted = adapter.extractUserPrompt(body);
    if (!extracted) {
      showPrivacyNotice('Ratchet: Outgoing request blocked (unrecognized message schema).');
      throw new Error('[Ratchet] Outgoing request blocked (unrecognized message schema)');
    }

    const convId = getConversationId();

    requestRedaction(extracted.prompt, convId)
      .then((redactedText) => {
        const newBody = extracted.replaceWith(redactedText);
        originalSend.call(this, newBody);
      })
      .catch(() => {
        showPrivacyNotice('Ratchet: Outgoing request blocked (redaction failed or timed out).');
        try {
          this.abort();
        } catch {}
      });
  };
})();
