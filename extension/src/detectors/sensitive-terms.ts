/**
 * Ratchet Privacy Shield — Sensitive Terms Detector
 *
 * Implements user-defined "My sensitive terms" matching:
 * - Categories: names (PERSON), employers (ORG), projects (PROJECT), places (LOCATION).
 * - Whole-word, case-insensitive matching.
 * - Variants:
 *   1. Possessive 's / ’s (and ' after s)
 *   2. Last name alone if the user configured a multi-word personal name (e.g. "Alice Smith" -> "Smith", "Smith's")
 * - Assigns confidence 1.0 (explicit user configuration).
 */

import type { DetectedEntity, SensitiveTerm } from '../shared/types';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectWithSensitiveTerms(
  text: string,
  terms: SensitiveTerm[],
): DetectedEntity[] {
  if (!text || !terms || terms.length === 0) {
    return [];
  }

  const entities: DetectedEntity[] = [];

  for (const item of terms) {
    if (!item.enabled) continue;
    const cleanTerm = item.term.trim();
    if (!cleanTerm) continue;

    const category = item.category || 'PROJECT';

    // 1. Build pattern for full term + possessive variant
    // Matches \b<term>(?:['’]s\b|['’](?!\w)|\b)
    const escapedTerm = escapeRegex(cleanTerm);
    const fullRegex = new RegExp(
      `\\b${escapedTerm}(?:['’]s\\b|['’](?!\\w)|\\b)`,
      'gi',
    );

    let match: RegExpExecArray | null;
    while ((match = fullRegex.exec(text)) !== null) {
      if (match[0].length === 0) {
        fullRegex.lastIndex++;
        continue;
      }
      entities.push({
        type: category,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 1.0,
        source: 'custom',
      });
    }

    // 2. Simple variant: Last name alone if user adds a full name (e.g. "Alice Smith" -> "Smith")
    // Applies when category is PERSON (or personal name) and contains multiple words
    const words = cleanTerm.split(/\s+/);
    if (category === 'PERSON' && words.length >= 2) {
      const lastName = words[words.length - 1];
      if (lastName.length >= 2) {
        const escapedLast = escapeRegex(lastName);
        const lastRegex = new RegExp(
          `\\b${escapedLast}(?:['’]s\\b|['’](?!\\w)|\\b)`,
          'gi',
        );

        while ((match = lastRegex.exec(text)) !== null) {
          if (match[0].length === 0) {
            lastRegex.lastIndex++;
            continue;
          }
          const mStart = match.index;
          const mEnd = mStart + match[0].length;
          // Avoid matching last name when it falls within an already matched full name span
          if (entities.some((e) => mStart >= e.start && mEnd <= e.end)) {
            continue;
          }
          entities.push({
            type: category,
            value: match[0],
            start: mStart,
            end: mEnd,
            confidence: 1.0,
            source: 'custom',
          });
        }
      }
    }
  }

  return entities;
}
