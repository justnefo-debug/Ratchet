/**
 * Ratchet Privacy Shield — Custom Rules Detector
 *
 * Applies user-defined keyword and regex rules with runtime time guarding.
 * Rules exceeding the 25ms execution budget are skipped and produce warnings.
 */

import type { CustomRule, DetectedEntity } from '../shared/types';
import { validateRegexSafety } from './redos-validator';

export const CUSTOM_RULE_BUDGET_MS = 25; // 25ms per-rule budget

export type CustomRulesDetectionResult = DetectedEntity[] & {
  entities: DetectedEntity[];
  skippedRules: string[];
  warnings: string[];
};

/**
 * Detect entities using user-defined custom rules with a strict runtime time guard.
 * Any rule that exceeds budgetMs is aborted/skipped to prevent prompt stalls.
 * Returns an array of entities with attached skippedRules and warnings properties.
 */
export function detectWithCustomRules(
  text: string,
  rules: CustomRule[],
  budgetMs: number = CUSTOM_RULE_BUDGET_MS,
): CustomRulesDetectionResult {
  const entities: DetectedEntity[] = [];
  const skippedRules: string[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const ruleStart = performance.now();
    let ruleTimedOut = false;
    const ruleEntities: DetectedEntity[] = [];

    if (rule.type === 'keyword' && rule.values) {
      for (const keyword of rule.values) {
        if (performance.now() - ruleStart > budgetMs) {
          ruleTimedOut = true;
          break;
        }
        // Escape regex-special characters and add word boundaries
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'gi');
        let match: RegExpExecArray | null;

        while ((match = re.exec(text)) !== null) {
          ruleEntities.push({
            type: rule.category,
            value: match[0],
            start: match.index,
            end: match.index + match[0].length,
            confidence: rule.confidence,
            source: 'custom',
          });
          if (performance.now() - ruleStart > budgetMs) {
            ruleTimedOut = true;
            break;
          }
        }
      }
    } else if (rule.type === 'regex' && rule.pattern) {
      // 1. Enforce ReDoS-safe regex subset check before compiling or executing
      const safety = validateRegexSafety(rule.pattern);
      if (!safety.valid) {
        skippedRules.push(rule.name);
        warnings.push(
          `Custom rule "${rule.name}" rejected: pattern violates ReDoS-safe subset (${safety.error}) and was skipped.`,
        );
        continue;
      }

      try {
        const re = new RegExp(rule.pattern, 'g');
        let match: RegExpExecArray | null;

        while ((match = re.exec(text)) !== null) {
          // Safeguard against zero-length matches causing infinite loops
          if (match[0].length === 0) {
            re.lastIndex++;
            continue;
          }

          ruleEntities.push({
            type: rule.category,
            value: match[0],
            start: match.index,
            end: match.index + match[0].length,
            confidence: rule.confidence,
            source: 'custom',
          });

          // Runtime guard: check if rule has exceeded execution budget
          if (performance.now() - ruleStart > budgetMs) {
            ruleTimedOut = true;
            break;
          }
        }
      } catch {
        console.warn(`[Ratchet] Invalid custom rule regex: ${rule.pattern}`);
      }
    }

    if (ruleTimedOut || performance.now() - ruleStart > budgetMs) {
      skippedRules.push(rule.name);
      warnings.push(
        `Custom rule "${rule.name}" exceeded ${budgetMs}ms execution budget and was skipped.`,
      );
      continue;
    }

    entities.push(...ruleEntities);
  }

  return Object.assign(entities, {
    entities,
    skippedRules,
    warnings,
  });
}
