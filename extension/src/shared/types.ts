/**
 * Ratchet Privacy Shield — Shared Type Definitions
 *
 * All interfaces and type aliases used across the extension.
 * These are compile-time only and produce no runtime code.
 */

// ─── Detection ───────────────────────────────────────────────────

/** A single detected PII entity in the user's text. */
export interface DetectedEntity {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
  source: 'regex' | 'ner' | 'custom';
}

// ─── Mapping ─────────────────────────────────────────────────────

/** One placeholder ↔ original-value pair. */
export interface MappingEntry {
  placeholder: string;   // e.g. «PERSON_1»
  original: string;      // e.g. "John Doe"
  type: string;          // e.g. "PERSON"
}

/** Stored per-conversation in chrome.storage.session. */
export interface ConversationMapping {
  conversationId: string;
  siteOrigin: string;
  entries: MappingEntry[];
  createdAt: number;
  lastUsedAt: number;
}

// ─── Custom Rules ────────────────────────────────────────────────

export interface CustomRule {
  id: string;
  name: string;
  type: 'keyword' | 'regex';
  pattern: string;
  values?: string[];
  category: string;
  enabled: boolean;
  confidence: number;
}

// ─── Settings ────────────────────────────────────────────────────

export type Sensitivity = 'low' | 'medium' | 'high';

export interface RatchetSettings {
  enabled: boolean;
  sensitivity: Sensitivity;
  customRules: CustomRule[];
  enabledSites: {
    chatgpt: boolean;
    claude: boolean;
    gemini: boolean;
  };
  enablePersistence: boolean;
  persistenceExpiryHours: number;
  entityToggles: Record<string, boolean>;
  powerMode: boolean;
  backendUrl: string;
}

// ─── Inter-context Messaging ─────────────────────────────────────

/** Messages from MAIN world → ISOLATED content script */
export interface MainToIsolatedMessage {
  source: 'RATCHET_MAIN';
  id: string;
  type: 'REDACT_REQUEST' | 'REDACTION_COMPLETE' | 'ENABLED_CHECK';
  payload: unknown;
}

/** Messages from ISOLATED content script → MAIN world */
export interface IsolatedToMainMessage {
  source: 'RATCHET_ISOLATED';
  id: string;
  type: 'REDACT_RESPONSE' | 'ENABLED_STATUS';
  payload: unknown;
}

/** Messages between content script ↔ service worker */
export interface ServiceWorkerRequest {
  action: 'redact' | 'restore' | 'getSettings' | 'getMapping';
  text?: string;
  conversationId?: string;
  siteOrigin?: string;
}

export interface RedactResult {
  redactedText: string;
  mappings: MappingEntry[];
  entities: DetectedEntity[];
  conversationId: string;
}

export interface RestoreResult {
  restoredText: string;
}

// ─── Site Adapter ────────────────────────────────────────────────

export interface SiteAdapter {
  name: string;
  hostnames: string[];

  /** Returns true if the request URL targets this site's chat API. */
  matchesRequest(url: string): boolean;

  /** Extract the user's prompt text from the request body JSON string. */
  extractPrompt(body: string): string | null;

  /** Return a new body JSON string with the prompt replaced. */
  replacePrompt(body: string, redactedText: string): string;

  /** Extract the current conversation ID from the page URL. */
  getConversationId(): string | null;

  /** Extract AI response text from a single SSE data payload. */
  extractResponseText(eventData: string): string | null;

  /** Return a new SSE data payload with the response text replaced. */
  replaceResponseText(eventData: string, restoredText: string): string;
}

declare global {
  const __TEST_BUILD__: boolean;
}

