/**
 * Ratchet Privacy Shield — ISOLATED-World Interceptor Relay
 *
 * Listens for REDACT_REQUEST messages from the MAIN-world interceptor,
 * delegates redaction to the background service worker, optionally presents
 * the closed Shadow DOM Review-Before-Send panel, and returns REDACT_RESPONSE
 * back to the MAIN world via postMessage.
 *
 * Security & Isolation Guarantees:
 * - Review panel runs in a closed Shadow DOM overlay (mode: 'closed').
 * - Raw values are never sent over window.postMessage to the MAIN world.
 * - Enforces fail-closed: user cancel or timeout sends an error response,
 *   prompting the MAIN-world script to abort the wire request cleanly.
 */

import { getAdapterForUrl } from '../adapters';
import { showReviewPanel, type ReviewItem } from './review-panel';
import type { RatchetSettings } from '../shared/types';

export class ContentInterceptor {
  private adapter = getAdapterForUrl(window.location.href);
  private currentUrl = window.location.href;
  private pendingTempId: string | null = null;
  /** Ephemeral session-only list of values exempted from redaction */
  private sessionExemptions = new Set<string>();

  constructor() {
    this.initMessageBridge();
    this.initUrlWatcher();
  }

  private isReviewEnabledForOrigin(origin: string, settings?: RatchetSettings): boolean {
    if (!settings) return false;
    if (settings.reviewBeforeSend === false) return false;
    const lower = origin.toLowerCase();
    const sites: Record<string, boolean> = (settings.reviewSites as any) || {};
    if (lower.includes('chatgpt.com') || lower.includes('chat.openai.com')) {
      return sites.chatgpt !== false;
    }
    if (lower.includes('claude.ai')) {
      return sites.claude !== false;
    }
    if (lower.includes('gemini.google.com')) {
      return sites.gemini !== false;
    }
    if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
      return sites.mock === true;
    }
    return true;
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
                return;
              }

              // Query current settings to check "Review before sending"
              chrome.runtime.sendMessage({ action: 'getSettings' }, (settingsResp) => {
                const settings: RatchetSettings | undefined = settingsResp?.data;
                const reviewEnabled = this.isReviewEnabledForOrigin(window.location.origin, settings);

                // Prepare review items from mappings
                const rawMappings: Array<{ placeholder: string; original: string; type: string }> =
                  response.data.mappings || [];
                const skippedRules: string[] = response.data?.skippedRules || [];
                const hasSkippedRules = skippedRules.length > 0;

                // Filter out any items in the session-only exemption list
                const reviewItems: ReviewItem[] = [];
                let currentRedactedText = response.data.redactedText;

                for (const m of rawMappings) {
                  if (this.sessionExemptions.has(m.original)) {
                    // Replace placeholder back with original value immediately
                    currentRedactedText = currentRedactedText.split(m.placeholder).join(m.original);
                  } else {
                    reviewItems.push({
                      category: m.type,
                      original: m.original,
                      placeholder: m.placeholder,
                    });
                  }
                }

                // If Review is enabled and sensitive items are detected, OR if any custom rules were skipped:
                if ((reviewEnabled && reviewItems.length > 0) || hasSkippedRules) {
                  showReviewPanel({
                    items: reviewItems,
                    originalText: text,
                    redactedText: currentRedactedText,
                    skippedRules,
                    warnings: response.data?.warnings || [],
                    timeoutSeconds: settings?.reviewTimeoutSeconds ?? 60,
                    onSend: (finalWireText: string) => {
                      window.dispatchEvent(new CustomEvent('ratchet:mapping-updated'));
                      window.postMessage(
                        {
                          source: 'RATCHET_ISOLATED',
                          requestId,
                          success: true,
                          redactedText: finalWireText,
                          warnings: response.data.warnings || [],
                        },
                        '*',
                      );
                    },
                    onCancel: (reason: string) => {
                      window.postMessage(
                        {
                          source: 'RATCHET_ISOLATED',
                          requestId,
                          success: false,
                          error:
                            reason === 'timeout'
                              ? 'Review timed out (fail-closed)'
                              : hasSkippedRules
                              ? `Prompt blocked: custom rule(s) "${skippedRules.join(', ')}" were skipped`
                              : 'Prompt cancelled by user',
                        },
                        '*',
                      );
                    },
                    onSessionExempt: (val: string) => {
                      this.sessionExemptions.add(val);
                    },
                  });
                } else {
                  // Direct transmission without review modal
                  window.dispatchEvent(new CustomEvent('ratchet:mapping-updated'));
                  window.postMessage(
                    {
                      source: 'RATCHET_ISOLATED',
                      requestId,
                      success: true,
                      redactedText: currentRedactedText,
                      warnings: response.data.warnings || [],
                    },
                    '*',
                  );
                }
              });
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
