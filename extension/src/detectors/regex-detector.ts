/**
 * Ratchet Privacy Shield — Regex-Based PII Detector
 *
 * Port of backend/detectors/regex_detector.py to TypeScript.
 * Pre-compiled patterns for performance with ReDoS protection.
 */

import type { DetectedEntity } from '../shared/types';

export interface PatternDef {
  regex: RegExp;
  confidence: number;
  validate?: (match: string) => boolean;
}

// ─── Validation Helpers ──────────────────────────────────────────

/** Luhn algorithm for credit-card validation. */
export function luhnCheck(cardNumber: string): boolean {
  if (typeof cardNumber !== 'string') return false;
  const digitsOnly = cardNumber.replace(/\D/g, '');
  if (digitsOnly.length < 13 || digitsOnly.length > 19) return false;

  const digits = digitsOnly.split('').map(Number);
  let checksum = 0;
  const reversed = [...digits].reverse();
  for (let i = 0; i < reversed.length; i++) {
    let d = reversed[i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    checksum += d;
  }
  return checksum % 10 === 0;
}

/** IPv4 octet validation. */
export function isValidIPv4(ip: string): boolean {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

// ─── Pattern Definitions ─────────────────────────────────────────

export const PATTERNS: Record<string, PatternDef> = {
  EMAIL: {
    // RFC 5321 length bounded to prevent polynomial backtracking on adversarial input
    regex: /\b[a-zA-Z0-9_.+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63})+\b/g,
    confidence: 0.95,
  },
  PHONE: {
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}(?:[-.\s]?\d{3,4})?\b/g,
    confidence: 0.90,
  },
  CNIC: {
    regex: /\b\d{5}-\d{7}-\d\b/g,
    confidence: 0.99,
  },
  API_KEY: {
    regex: /\b(?:sk-[a-zA-Z0-9_-]{12,64}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})\b/g,
    confidence: 0.99,
  },
  CREDIT_CARD: {
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{4}[-\s]?\d{6}[-\s]?\d{5}\b/g,
    confidence: 0.98,
    validate: luhnCheck,
  },
  SSN: {
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 0.99,
  },
  IPV4: {
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    confidence: 0.90,
    validate: isValidIPv4,
  },
  IPV6: {
    regex: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g,
    confidence: 0.95,
  },
  MAC_ADDRESS: {
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    confidence: 0.95,
  },
  URL_WITH_CREDS: {
    regex: /https?:\/\/[a-zA-Z0-9_.-]{1,64}:[^@\s]{1,128}@[^\s]+/g,
    confidence: 0.99,
  },
  DATE_OF_BIRTH: {
    regex:
      /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b|\b(?:0[1-9]|[12]\d|3[01])[-/](?:0[1-9]|1[0-2])[-/](?:19|20)\d{2}\b/g,
    confidence: 0.85,
  },
};

// ─── Public API ──────────────────────────────────────────────────

/**
 * Run all regex patterns against `text` and return matched entities.
 * Each pattern's RegExp is re-created per call so `.lastIndex` is reset.
 */
export function detectWithRegex(text: string): DetectedEntity[] {
  const entities: DetectedEntity[] = [];

  for (const [typeName, def] of Object.entries(PATTERNS)) {
    // Clone regex to reset lastIndex
    const re = new RegExp(def.regex.source, def.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      const value = match[0];

      // Run optional per-pattern validation
      if (def.validate && !def.validate(value)) continue;

      entities.push({
        type: typeName,
        value,
        start: match.index,
        end: match.index + value.length,
        confidence: def.confidence,
        source: 'regex',
      });
    }
  }

  return entities;
}
