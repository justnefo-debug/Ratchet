/**
 * Ratchet Privacy Shield — Custom Rules Detector
 *
 * Applies user-defined keyword and regex rules.
 * Rules are stored in chrome.storage.local and passed in at call time.
 */

import type { CustomRule, DetectedEntity } from '../shared/types';

/**
 * Detect entities using user-defined custom rules.
 */
export function detectWithCustomRules(
  text: string,
  rules: CustomRule[],
): DetectedEntity[] {
  const entities: DetectedEntity[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.type === 'keyword' && rule.values) {
      for (const keyword of rule.values) {
        // Escape regex-special characters and add word boundaries
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'gi');
        let match: RegExpExecArray | null;

        while ((match = re.exec(text)) !== null) {
          entities.push({
            type: rule.category,
            value: match[0],
            start: match.index,
            end: match.index + match[0].length,
            confidence: rule.confidence,
            source: 'custom',
          });
        }
      }
    } else if (rule.type === 'regex' && rule.pattern) {
      try {
        const re = new RegExp(rule.pattern, 'g');
        let match: RegExpExecArray | null;

        while ((match = re.exec(text)) !== null) {
          // Safeguard against zero-length matches causing infinite loops
          if (match[0].length === 0) {
            re.lastIndex++;
            continue;
          }

          entities.push({
            type: rule.category,
            value: match[0],
            start: match.index,
            end: match.index + match[0].length,
            confidence: rule.confidence,
            source: 'custom',
          });
        }
      } catch {
        // Skip invalid regex patterns
        console.warn(`[Ratchet] Invalid custom rule regex: ${rule.pattern}`);
      }
    }
  }

  return entities;
}
