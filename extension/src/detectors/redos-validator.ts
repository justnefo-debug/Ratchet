/**
 * Ratchet Privacy Shield — ReDoS Validator
 *
 * Validates user-supplied custom regular expressions before saving.
 * Rejects invalid syntax, dangerous nested quantifiers, and patterns
 * exceeding a 25ms execution cutoff against adversarial test inputs.
 */

export interface ReDoSValidationResult {
  valid: boolean;
  error?: string;
  executionTimeMs?: number;
}

/**
 * Validates a regex pattern against syntax errors and catastrophic backtracking (ReDoS).
 */
export function validateRegexSafety(pattern: string): ReDoSValidationResult {
  if (!pattern || pattern.trim() === '') {
    return { valid: false, error: 'Pattern cannot be empty' };
  }

  // 1. Syntax check
  try {
    new RegExp(pattern, 'g');
  } catch (err: any) {
    return { valid: false, error: `Invalid regular expression: ${err.message}` };
  }

  // 2. Static heuristic check for dangerous nested quantifiers e.g. (a+)+, ([0-9]*)*, (x+)*
  const nestedQuantifier = /\([^)]*[+*][^)]*\)[+*]/;
  if (nestedQuantifier.test(pattern)) {
    return {
      valid: false,
      error: 'Pattern rejected: dangerous nested repetition quantifier detected (ReDoS risk)',
    };
  }

  // 3. Dynamic timing check against adversarial strings
  const testInputs = [
    'a'.repeat(25) + '!',
    'a'.repeat(35) + '!',
    '0123456789'.repeat(3) + '!',
    'a b c d e '.repeat(3) + '!',
    '--..__@@'.repeat(4) + '!',
  ];

  let maxElapsed = 0;
  for (const input of testInputs) {
    const start = performance.now();
    try {
      const tester = new RegExp(pattern);
      tester.test(input);
      const elapsed = performance.now() - start;
      if (elapsed > maxElapsed) maxElapsed = elapsed;

      if (elapsed > 25) {
        return {
          valid: false,
          error: `Pattern rejected: execution time exceeded 25ms limit (${elapsed.toFixed(1)}ms on test input - ReDoS risk)`,
          executionTimeMs: elapsed,
        };
      }
    } catch (err: any) {
      return { valid: false, error: `Execution error: ${err.message}` };
    }
  }

  return { valid: true, executionTimeMs: maxElapsed };
}
