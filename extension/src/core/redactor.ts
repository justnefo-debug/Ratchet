/**
 * Ratchet Privacy Shield — Redaction Engine
 *
 * Replaces detected entities with «TYPE_N» placeholders.
 * Returns the redacted text and a mapping for later restoration.
 */

import type { DetectedEntity, MappingEntry } from '../shared/types';
import { PLACEHOLDER_START, PLACEHOLDER_END } from '../shared/constants';

export interface RedactionResult {
  redactedText: string;
  mappings: MappingEntry[];
}

/**
 * Deduplicate overlapping entity intervals.
 * Prioritizes earlier start index, then longer match length, then higher confidence.
 */
export function deduplicateOverlaps(entities: DetectedEntity[]): DetectedEntity[] {
  if (entities.length <= 1) return [...entities];

  const sorted = [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA !== lenB) return lenB - lenA;
    return b.confidence - a.confidence;
  });

  const filtered: DetectedEntity[] = [];
  let lastEnd = -1;

  for (const ent of sorted) {
    if (ent.start >= lastEnd) {
      filtered.push(ent);
      lastEnd = ent.end;
    }
  }

  return filtered;
}

/**
 * Redact all `entities` in `text`, returning the sanitised text and the
 * placeholder → original mapping needed for restoration.
 *
 * The mapping also includes any `existingMappings` so that follow-up
 * messages in the same conversation can re-use the same placeholder
 * numbers (e.g. «PERSON_1» always means "John Doe").
 */
export function redact(
  text: string,
  entities: DetectedEntity[],
  existingMappings: MappingEntry[] = [],
): RedactionResult {
  const cleanEntities = deduplicateOverlaps(entities);
  if (cleanEntities.length === 0) {
    return { redactedText: text, mappings: [...existingMappings] };
  }

  // Build a counter map from existing mappings so we continue numbering
  const counters: Record<string, number> = {};
  const valueToPlaceholder = new Map<string, string>();

  for (const m of existingMappings) {
    valueToPlaceholder.set(m.original, m.placeholder);
    // Parse the number from the existing placeholder, e.g. «PERSON_3» → 3
    const numMatch = m.placeholder.match(/_(\d+)»$/);
    if (numMatch) {
      const num = Number(numMatch[1]);
      counters[m.type] = Math.max(counters[m.type] ?? 0, num);
    }
  }

  // Sort entities left-to-right by start index
  const sorted = [...cleanEntities].sort((a, b) => a.start - b.start);

  // Assign placeholders (left-to-right for stable numbering)
  const assignments: Array<{
    entity: DetectedEntity;
    placeholder: string;
  }> = [];

  for (const entity of sorted) {
    // Re-use an existing placeholder if we've seen this exact value before
    let placeholder = valueToPlaceholder.get(entity.value);
    if (!placeholder) {
      counters[entity.type] = (counters[entity.type] ?? 0) + 1;
      placeholder = `${PLACEHOLDER_START}${entity.type}_${counters[entity.type]}${PLACEHOLDER_END}`;
      valueToPlaceholder.set(entity.value, placeholder);
    }
    assignments.push({ entity, placeholder });
  }

  // Replace right-to-left so earlier indices are not disturbed
  let redactedText = text;
  const newMappings: MappingEntry[] = [...existingMappings];

  for (let i = assignments.length - 1; i >= 0; i--) {
    const { entity, placeholder } = assignments[i];
    redactedText =
      redactedText.slice(0, entity.start) +
      placeholder +
      redactedText.slice(entity.end);

    // Only add to mappings if not already present
    if (!newMappings.some((m) => m.placeholder === placeholder)) {
      newMappings.push({
        placeholder,
        original: entity.value,
        type: entity.type,
      });
    }
  }

  return { redactedText, mappings: newMappings };
}
