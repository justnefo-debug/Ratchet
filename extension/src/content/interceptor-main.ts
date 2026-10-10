/**
 * Ratchet Privacy Shield — MAIN-World Network Interceptor
 *
 * Injected at document_start in the MAIN world.
 * Wraps window.fetch and XMLHttpRequest for target AI endpoints.
 * Relays user prompts to the ISOLATED content script for redaction.
 * Enforces strict fail-closed security: if redaction fails or times out,
 * the outgoing request is blocked and never sent.
 * NEVER logs raw prompts, mappings, or restored text.
 *
 * A2 Shape-Based Classification:
 * - Message request (has messages[] with user message): redact text fields
 * - Non-message request (no messages key): pass through with safety-net scan
 * - Unknown message shape (has messages but unexpected): fail closed
 */

const RATCHET_DEBUG = false;

import { getAdapterForUrl } from '../adapters';
import type { RequestClassification } from '../adapters/types';
import { showPrivacyNotice, showWarningNotice } from './ui-notice';

/**
 * Summarize a JSON string, replacing string values with their length.
 * NEVER includes raw text content — only structural info.
 */
function summarizeJson(jsonStr: string): any {
  try {
    const obj = JSON.parse(jsonStr);
    const recurse = (val: any): any => {
      if (typeof val === 'string') return `string(${val.length})`;
      if (Array.isArray(val)) return val.map(recurse);
      if (val && typeof val === 'object') {
        const out: any = {};
        for (const k of Object.keys(val)) {
          out[k] = recurse(val[k]);
        }
        return out;
      }
      return val;
    };
    return recurse(obj);
  } catch {
    return 'invalid JSON';
  }
}

/**
 * Collect all string values from a parsed JSON object.
 * Used by the safety-net scan on non-message requests.
 */
function collectStringValues(obj: any): string[] {
  const strings: string[] = [];
  const recurse = (val: any) => {
    if (typeof val === 'string') {
      strings.push(val);
    } else if (Array.isArray(val)) {
      for (const item of val) recurse(item);
    } else if (val && typeof val === 'object') {
      for (const k of Object.keys(val)) recurse(val[k]);
    }
  };
  recurse(obj);
  return strings;
}

/**
 * Safety-net scan: Run structured regex detectors (EMAIL, PHONE, API_KEY,
 * CREDIT_CARD, SSN, CNIC, IPV4, IPV6, MAC_ADDRESS, URL_WITH_CREDS, DATE_OF_BIRTH)
 * and user's "My sensitive terms" against string values.
 *
 * EXCLUDES: PERSON, ORG, LOCATION (name/org/location NER) because non-message
 * bodies legitimately contain things like timezone "Asia/Karachi" and model names.
 *
 * This runs in the MAIN world, so we use simple regex patterns inline
 * (the full detectors live in the service worker). We keep it minimal
 * to avoid false positives on metadata fields.
 */
const SAFETY_NET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'EMAIL', regex: /\b[a-zA-Z0-9_.+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63})+\b/g },
  { name: 'PHONE', regex: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}(?:[-.\s]?\d{3,4})?\b/g },
  { name: 'API_KEY', regex: /\b(?:sk-[a-zA-Z0-9_-]{12,64}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})\b/g },
  { name: 'CREDIT_CARD', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
  { name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'CNIC', regex: /\b\d{5}-\d{7}-\d\b/g },
  { name: 'IPV4', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { name: 'IPV6', regex: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g },
  { name: 'MAC_ADDRESS', regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g },
  { name: 'URL_WITH_CREDS', regex: /https?:\/\/[a-zA-Z0-9_.-]{1,64}:[^@\s]{1,128}@[^\s]+/g },
  { name: 'DATE_OF_BIRTH', regex: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g },
];

function runSafetyNetScan(text: string): Array<{ type: string; value: string }> {
  const hits: Array<{ type: string; value: string }> = [];
  for (const p of SAFETY_NET_PATTERNS) {
    const re = new RegExp(p.regex.source, p.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ type: p.name, value: `[${p.name} match, length ${m[0].length}]` });
    }
  }
  return hits;
}

/**
 * Also check user's sensitive terms, relayed from ISOLATED world.
 * The MAIN world asks the ISOLATED world for the list via postMessage.
 * For simplicity and security, we request sensitive terms from the ISOLATED
 * world at startup and cache them.
 */
let cachedSensitiveTermPatterns: Array<{ name: string; regex: RegExp }> = [];

function requestSensitiveTerms(): void {
  window.postMessage({
    source: 'RATCHET_MAIN',
    type: 'GET_SENSITIVE_TERMS',
  }, '*');
}

// Listen for sensitive terms response from ISOLATED world
window.addEventListener('message', (evt: MessageEvent) => {
  if (evt.source !== window || !evt.data || evt.data.source !== 'RATCHET_ISOLATED') return;
  if (evt.data.type === 'SENSITIVE_TERMS_RESPONSE' && Array.isArray(evt.data.terms)) {
    cachedSensitiveTermPatterns = [];
    for (const term of evt.data.terms) {
      if (typeof term === 'string' && term.trim()) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cachedSensitiveTermPatterns.push({
          name: 'SENSITIVE_TERM',
          regex: new RegExp(`\\b${escaped}\\b`, 'gi'),
        });
      }
    }
  }
});

function runSensitiveTermsScan(text: string): Array<{ type: string; value: string }> {
  const hits: Array<{ type: string; value: string }> = [];
  for (const p of cachedSensitiveTermPatterns) {
    const re = new RegExp(p.regex.source, p.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ type: p.name, value: `[sensitive term match, length ${m[0].length}]` });
    }
  }
  return hits;
}

(() => {
  const adapter = getAdapterForUrl(window.location.href);
  if (!adapter) {
    return;
  }

  if (RATCHET_DEBUG) {
    console.log(`Ratchet: interceptor installed on ${window.location.hostname}`);
  }

  // Request sensitive terms on startup
  requestSensitiveTerms();

  // Temporary conversation key for new chats
  let tempConvId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function getConversationId(): string {
    const realId = adapter?.getConversationId(window.location.href);
    if (realId) return realId;
    return tempConvId;
  }

  /** Replace UUIDs and numeric IDs in paths for diagnostic display */
  function anonymizePath(path: string): string {
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/[0-9a-f]{24,}/gi, '/:id')
      .replace(/\/\d{10,}/g, '/:id');
  }

  /** Send a diagnostic entry to the ISOLATED world for storage */
  function logDiagnostic(
    method: string,
    url: string,
    contentType: string,
    rawBody: string | null,
    classification: RequestClassification,
    decision: 'passed-through' | 'redacted' | 'blocked',
    blockReason?: string,
  ): void {
    const urlObj = (() => {
      try { return new URL(url, window.location.origin); }
      catch { return null; }
    })();
    const path = urlObj ? anonymizePath(urlObj.pathname) : url;

    // Build JSON structure summary (content-free)
    let jsonStructure: any = null;
    if (rawBody && typeof rawBody === 'string') {
      try {
        const trimmed = rawBody.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          jsonStructure = summarizeJson(rawBody);
        }
      } catch {}
    }

    window.postMessage({
      source: 'RATCHET_MAIN',
      type: 'DIAGNOSTIC_LOG',
      payload: {
        timestamp: new Date().toISOString(),
        method,
        path,
        contentType,
        bodyType: rawBody !== null ? 'string' : 'null',
        classification,
        decision,
        blockReason: blockReason || null,
        jsonStructure,
      }
    }, '*');
  }

  /**
   * Request-ID based communication channel with ISOLATED content script.
   */
  function requestRedaction(prompt: string, convId: string, timeoutMs = 70000): Promise<string> {
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

  /**
   * Process a matched request: classify by shape, then redact / pass / block.
   */
  async function processRequest(
    rawBody: string,
    method: string,
    url: string,
    contentType: string,
    callStyle: string,
  ): Promise<{ action: 'redact'; newBody: string } | { action: 'pass' } | { action: 'block'; reason: string }> {
    // Shape-based classification
    const { classification, extracted } = adapter!.classifyRequest(rawBody);

    const urlObj = (() => {
      try { return new URL(url, window.location.origin); }
      catch { return null; }
    })();
    const pathForLog = urlObj ? anonymizePath(urlObj.pathname) : url;

    if (classification === 'unknown-message-shape') {
      logDiagnostic(method, url, contentType, rawBody, classification, 'blocked', 'Unexpected message shape (fail closed)');
      if (RATCHET_DEBUG) console.log(`Ratchet: POST ${pathForLog} -> blocked: Unexpected message shape (fail closed) (style: ${callStyle})`);
      return { action: 'block', reason: 'Unexpected message shape (fail closed)' };
    }

    if (classification === 'message' && extracted) {
      // Standard message redaction flow
      const convId = getConversationId();
      let redactedText: string;

      try {
        redactedText = await requestRedaction(extracted.prompt, convId);
      } catch (err: any) {
        const msg = err?.message || '';
        logDiagnostic(method, url, contentType, rawBody, classification, 'blocked', msg);

        if (msg.includes('custom rule')) {
          showPrivacyNotice(`Ratchet: Outgoing request blocked (skipped custom rule).`);
        } else if (msg.includes('cancelled')) {
          showWarningNotice('Ratchet: Outgoing prompt cancelled by user.');
        } else if (msg.includes('timed out')) {
          showPrivacyNotice('Ratchet: Outgoing request blocked (review timed out).');
        } else {
          showPrivacyNotice('Ratchet: Outgoing request blocked (redaction failed or timed out).');
        }
        if (RATCHET_DEBUG) console.log(`Ratchet: POST ${pathForLog} -> blocked: ${msg} (style: ${callStyle})`);
        return { action: 'block', reason: msg };
      }

      const newBody = extracted.replaceWith(redactedText);
      logDiagnostic(method, url, contentType, rawBody, classification, 'redacted');
      if (RATCHET_DEBUG) console.log(`Ratchet: POST ${pathForLog} -> redacted (style: ${callStyle})`);
      return { action: 'redact', newBody };
    }

    // Non-message request: run safety-net scan
    // Collect all string values from the body
    let allText = rawBody;
    try {
      const parsed = JSON.parse(rawBody);
      const strings = collectStringValues(parsed);
      allText = strings.join(' ');
    } catch {
      // Raw string body — scan it directly
    }

    const regexHits = runSafetyNetScan(allText);
    const termHits = runSensitiveTermsScan(allText);
    const allHits = [...regexHits, ...termHits];

    if (allHits.length > 0) {
      const hitTypes = [...new Set(allHits.map(h => h.type))].join(', ');
      const reason = `Possible sensitive data in unrecognized request (${hitTypes})`;
      logDiagnostic(method, url, contentType, rawBody, classification, 'blocked', reason);
      if (RATCHET_DEBUG) console.log(`Ratchet: POST ${pathForLog} -> blocked: ${reason} (style: ${callStyle})`);
      return { action: 'block', reason };
    }

    // Clean non-message request — pass through
    logDiagnostic(method, url, contentType, rawBody, classification, 'passed-through');
    if (RATCHET_DEBUG) console.log(`Ratchet: POST ${pathForLog} -> passed through (style: ${callStyle})`);
    return { action: 'pass' };
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

    let callStyle = '';
    if (typeof input === 'string') {
      callStyle = 'fetch string URL';
    } else if (input instanceof URL) {
      callStyle = 'fetch string URL';
    } else if (input instanceof Request) {
      callStyle = 'fetch with a Request object';
    }

    let req: Request;
    try {
      req = new Request(input, init);
    } catch {
      showPrivacyNotice('Ratchet: Outgoing request blocked (unreadable payload).');
      throw new Error('[Ratchet] Outgoing request blocked (unreadable payload)');
    }

    let rawBody: string | null = null;
    try {
      rawBody = await req.clone().text();
    } catch {
      rawBody = null;
    }

    if (!rawBody) {
      showPrivacyNotice('Ratchet: Outgoing request blocked (unreadable payload).');
      throw new Error('[Ratchet] Outgoing request blocked (unreadable payload)');
    }

    const contentType = req.headers.get('content-type') || 'unknown';
    const result = await processRequest(rawBody, method, url, contentType, callStyle);

    if (result.action === 'block') {
      showPrivacyNotice(`Ratchet: Outgoing request blocked (${result.reason}).`);
      throw new Error(`[Ratchet] Outgoing request blocked (${result.reason})`);
    }

    if (result.action === 'redact') {
      return originalFetch.call(this, new Request(req, { body: result.newBody }));
    }

    // action === 'pass' — pass through untouched
    return originalFetch.call(this, req);
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

    const contentType = 'unknown (XHR)';
    const callStyle = 'XHR';

    processRequest(body, method, url, contentType, callStyle)
      .then((result) => {
        if (result.action === 'block') {
          showPrivacyNotice(`Ratchet: Outgoing request blocked (${result.reason}).`);
          try { this.abort(); } catch {}
          return;
        }

        if (result.action === 'redact') {
          originalSend.call(this, result.newBody);
          return;
        }

        // action === 'pass'
        originalSend.call(this, body);
      })
      .catch((err: any) => {
        const msg = err?.message || '';
        showPrivacyNotice(`Ratchet: Outgoing request blocked (${msg}).`);
        try {
          this.abort();
        } catch {}
      });
  };
})();
