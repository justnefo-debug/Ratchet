import type { DetectedEntity, SessionRecord } from '../types';

export interface RestoredPart {
  text: string;
  isRestored: boolean;
  entity?: DetectedEntity;
}

export interface RestorationResult {
  restoredText: string;
  parts: RestoredPart[];
  restoredCount: number;
  unmatchedPlaceholders: string[];
}

/**
 * Restore placeholders in AI response back to original sensitive values
 */
export function restoreTextFromSession(
  aiResponseText: string,
  session: SessionRecord
): RestorationResult {
  if (!aiResponseText || !session || !session.entities) {
    return {
      restoredText: aiResponseText || '',
      parts: [{ text: aiResponseText || '', isRestored: false }],
      restoredCount: 0,
      unmatchedPlaceholders: [],
    };
  }

  // Create a mapping from placeholder (and bracketed versions) to the original entity
  const placeholderMap = new Map<string, DetectedEntity>();
  for (const entity of session.entities) {
    // Exact placeholder
    placeholderMap.set(entity.placeholder.toUpperCase(), entity);
    // Bracketed version [PERSON_1]
    placeholderMap.set(`[${entity.placeholder.toUpperCase()}]`, entity);
  }

  // Build regex matching any of the placeholders or generic pattern like [A-Z_]+_\d+ or PERSON_\d+
  const placeholderKeys = Array.from(placeholderMap.keys()).map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  if (placeholderKeys.length === 0) {
    return {
      restoredText: aiResponseText,
      parts: [{ text: aiResponseText, isRestored: false }],
      restoredCount: 0,
      unmatchedPlaceholders: [],
    };
  }

  // Regex to match exact known placeholders or bracketed placeholders
  const regex = new RegExp(`(\\[?[A-Z0-9_]+_\\d+\\]?)`, 'g');

  const parts: RestoredPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let restoredCount = 0;
  const unmatched = new Set<string>();

  while ((match = regex.exec(aiResponseText)) !== null) {
    const matchedToken = match[0];
    const tokenClean = matchedToken.replace(/[\[\]]/g, '').toUpperCase();
    const tokenBracketed = `[${tokenClean}]`;

    // Check if we matched before this token
    if (match.index > lastIndex) {
      parts.push({
        text: aiResponseText.slice(lastIndex, match.index),
        isRestored: false,
      });
    }

    const entity = placeholderMap.get(tokenClean) || placeholderMap.get(tokenBracketed);

    if (entity) {
      parts.push({
        text: entity.originalValue,
        isRestored: true,
        entity,
      });
      restoredCount++;
    } else {
      parts.push({
        text: matchedToken,
        isRestored: false,
      });
      unmatched.add(matchedToken);
    }

    lastIndex = match.index + matchedToken.length;
  }

  if (lastIndex < aiResponseText.length) {
    parts.push({
      text: aiResponseText.slice(lastIndex),
      isRestored: false,
    });
  }

  const restoredText = parts.map((p) => p.text).join('');

  return {
    restoredText,
    parts,
    restoredCount,
    unmatchedPlaceholders: Array.from(unmatched),
  };
}
