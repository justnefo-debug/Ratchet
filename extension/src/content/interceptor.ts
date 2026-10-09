/**
 * Ratchet Privacy Shield — ISOLATED-World Interceptor Relay
 *
 * Listens for REDACT_REQUEST messages from the MAIN-world interceptor,
 * delegates redaction to the background service worker, and returns
 * REDACT_RESPONSE back to the MAIN world via postMessage.
 * Also monitors URL navigation to migrate temporary chat IDs to real IDs.
 */

import { getAdapterForUrl } from '../adapters';

export class ContentInterceptor {
  private adapter = getAdapterForUrl(window.location.href);
  private currentUrl = window.location.href;
  private pendingTempId: string | null = null;

  constructor() {
    this.initMessageBridge();
    this.initUrlWatcher();
  }

  private initMessageBridge(): void {
    window.addEventListener('message', (evt: MessageEvent) => {
      if (evt.source !== window || !evt.data || evt.data.source !== 'RATCHET_MAIN') {
        return;
      }

      if (evt.data.type === 'REDACT_REQUEST') {
        const { requestId, text, conversationId } = evt.data;

        if (typeof conversationId === 'string' && conversationId.startsWith('temp-')) {
          this.pendingTempId = conversationId;
        }

        try {
          chrome.runtime.sendMessage(
            {
              action: 'redact',
              text,
              conversationId,
              siteOrigin: window.location.origin,
            },
            (response) => {
              if (chrome.runtime.lastError || !response || !response.success) {
                window.postMessage(
                  {
                    source: 'RATCHET_ISOLATED',
                    requestId,
                    success: false,
                    error:
                      chrome.runtime.lastError?.message ||
                      response?.error ||
                      'Redaction service unavailable',
                  },
                  '*',
                );
              } else {
                window.dispatchEvent(new CustomEvent('ratchet:mapping-updated'));
                window.postMessage(
                  {
                    source: 'RATCHET_ISOLATED',
                    requestId,
                    success: true,
                    redactedText: response.data.redactedText,
                  },
                  '*',
                );
              }
            },
          );
        } catch (err: any) {
          window.postMessage(
            {
              source: 'RATCHET_ISOLATED',
              requestId,
              success: false,
              error: err?.message || 'Failed to dispatch message to background worker',
            },
            '*',
          );
        }
      }
    });
  }

  private initUrlWatcher(): void {
    const checkUrl = () => {
      if (window.location.href !== this.currentUrl) {
        this.currentUrl = window.location.href;
        if (this.pendingTempId && this.adapter) {
          const realId = this.adapter.getConversationId(this.currentUrl);
          if (realId) {
            chrome.runtime.sendMessage({
              action: 'migrateMapping',
              fromId: this.pendingTempId,
              toId: realId,
            });
            this.pendingTempId = null;
          }
        }
      }
    };

    // Watch navigation events
    window.addEventListener('popstate', checkUrl);
    window.addEventListener('hashchange', checkUrl);
    setInterval(checkUrl, 1000);
  }
}
