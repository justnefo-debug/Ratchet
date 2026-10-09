/**
 * Ratchet Privacy Shield — Restoration Engine
 *
 * Replaces «TYPE_N» placeholders back to original values.
 * Two-pass strategy:
 *   1. Exact match — fast string replacement
 *   2. Flexible match — regex that tolerates spaces and missing delimiters
 */

import type { MappingEntry } from '../shared/types';

/**
 * Restore all placeholders in `text` using the provided mapping entries.
 */
export function restore(text: string, mappings: MappingEntry[]): string {
  if (mappings.length === 0 || !text) return text;

  let result = text;

  // ── Pass 1: exact match ────────────────────────────────────────
  const unmatched: MappingEntry[] = [];
  for (const entry of mappings) {
    if (result.includes(entry.placeholder)) {
      result = result.split(entry.placeholder).join(entry.original);
    } else {
      unmatched.push(entry);
    }
  }

  // ── Pass 2: flexible / fuzzy match ─────────────────────────────
  for (const entry of unmatched) {
    // Strip guillemets → "PERSON_1"
    const bare = entry.placeholder.replace(/^«/, '').replace(/»$/, '');

    // Build alternatives the AI might produce:
    //   «PERSON_1»  «PERSON 1»  « PERSON_1 »
    //   PERSON_1    PERSON 1    person_1
    //   [PERSON_1]  (AI might revert to bracket format)
    const underscoreToSpace = bare.replace(/_/g, ' ');
    const alts = [
      bare,
      underscoreToSpace,
    ].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const pattern = new RegExp(
      `«\\s*(?:${alts.join('|')})s?\\s*»` +      // guillemet variants
      `|\\[\\s*(?:${alts.join('|')})s?\\s*\\]` +  // bracket variants
      `|\\b(?:${alts.join('|')})s?\\b`,            // bare word variants
      'gi',
    );

    result = result.replace(pattern, entry.original);
  }

  return result;
}
