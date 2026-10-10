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

export const MAX_REGEX_PATTERN_LENGTH = 200;
export const MAX_QUANTIFIER_BOUND = 1000;

/**
 * Validates a regex pattern against syntax errors and catastrophic backtracking (ReDoS).
 */
export function validateRegexSafety(pattern: string): ReDoSValidationResult {
  if (!pattern || pattern.trim() === '') {
    return { valid: false, error: 'Pattern cannot be empty' };
  }

  // Length cap check
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return {
      valid: false,
      error: `Pattern rejected: length exceeds ${MAX_REGEX_PATTERN_LENGTH} character limit (${pattern.length} chars)`,
    };
  }

  // 1. Syntax check
  try {
    new RegExp(pattern, 'g');
  } catch (err: any) {
    return { valid: false, error: `Invalid regular expression: ${err.message}` };
  }

  // 1b. Compute maximum possible match length from quantifiers to ensure it doesn't exceed SCAN_CHUNK_OVERLAP
  const sanitizedForQuantifiers = pattern.replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
  
  if (/[*+]/.test(sanitizedForQuantifiers)) {
    return {
      valid: false,
      error: `Pattern rejected: unbounded quantifiers (* or +) are not allowed as their match length can exceed the chunk overlap`,
    };
  }

  let totalQuantifierBound = 0;
  
  const optionals = sanitizedForQuantifiers.match(/\?/g);
  if (optionals) {
    totalQuantifierBound += optionals.length;
  }

  const braces = sanitizedForQuantifiers.match(/\{(\d+)(?:,(\d*))?\}/g);
  if (braces) {
    for (const q of braces) {
      const inner = q.slice(1, -1);
      const parts = inner.split(',');
      if (parts.length === 1) {
        totalQuantifierBound += parseInt(parts[0], 10);
      } else {
        if (parts[1] === '') {
          return {
             valid: false,
             error: `Pattern rejected: unbounded quantifiers ({n,}) are not allowed as their match length can exceed the chunk overlap`,
          };
        } else {
          totalQuantifierBound += parseInt(parts[1], 10);
        }
      }
    }
  }

  // 1000 is SCAN_CHUNK_OVERLAP. We hardcode it to avoid circular dependency, but mention it in error
  if (totalQuantifierBound > 1000) {
    return {
      valid: false,
      error: `Pattern rejected: sum of upper bounds across quantifiers (${totalQuantifierBound}) exceeds maximum allowed match length (SCAN_CHUNK_OVERLAP of 1000)`,
    };
  }

  // 2. Static heuristic check for dangerous nested quantifiers e.g. (a+)+, ([0-9]*)*, (x+)*
  const nestedQuantifier = /\([^)]*[+*][^)]*\)[+*]/;
  if (nestedQuantifier.test(pattern)) {
    return {
      valid: false,
      error: 'Pattern rejected: dangerous nested repetition quantifier detected (ReDoS risk)',
    };
  }

  // 2b. Static check for dangerous repeated alternation groups e.g. (a|aa)+, (b|bb)+, ([a-z]|[a-z0-9])+
  const repeatedAlternation = /\([^)]*\|[^)]*\)[+*{]/;
  if (repeatedAlternation.test(pattern)) {
    return {
      valid: false,
      error: 'Pattern rejected: dangerous repeated alternation group detected (ReDoS risk)',
    };
  }

  // 2c. Static check for dangerous repeated wildcards e.g. (.*)+, (.+)+
  const repeatedWildcard = /\(\.?\*[+*]/;
  if (repeatedWildcard.test(pattern)) {
    return {
      valid: false,
      error: 'Pattern rejected: dangerous repeated wildcard detected (ReDoS risk)',
    };
  }

  // 2d. Static check for adjacent overlapping quantifiers on identical tokens e.g. x*x*, a+a+a+, .*.*
  const adjacentQuantifier = /(?:([a-zA-Z0-9_\-\.\*]|\\w|\\d|\\s)[+*]\1[+*])|(?:(?:[a-zA-Z0-9_\-]|\\w|\\d)[+*]){3,}/;
  if (adjacentQuantifier.test(pattern)) {
    return {
      valid: false,
      error: 'Pattern rejected: adjacent overlapping quantifiers detected (ReDoS risk)',
    };
  }

  // 3. Dynamic timing check against adversarial strings (including scaled lengths to catch polynomial backtracking)
  const chars = Array.from(new Set(pattern.replace(/[^a-zA-Z0-9]/g, ''))).slice(0, 3);
  const targetChar = chars[0] || 'a';

  const testInputs = [
    targetChar.repeat(25) + '!',
    targetChar.repeat(35) + '!',
    targetChar.repeat(100) + '!',
    targetChar.repeat(200) + '!',
    'a'.repeat(25) + '!',
    'a'.repeat(35) + '!',
    'a'.repeat(100) + '!',
    'a'.repeat(200) + '!',
    '0123456789'.repeat(10) + '!',
    'a b c d e '.repeat(10) + '!',
    '--..__@@'.repeat(10) + '!',
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

/**
 * Asynchronously validates a regex pattern in a separate Web Worker thread
 * with a hard timeout, guaranteeing the main UI thread never hangs.
 */
export function validateRegexSafetyAsync(
  pattern: string,
  timeoutMs: number = 300,
): Promise<ReDoSValidationResult> {
  // 1. Immediate static syntax & nested repetition check
  const fastCheck = validateRegexSafety(pattern);
  if (!fastCheck.valid) {
    return Promise.resolve(fastCheck);
  }

  // 2. If running in environment without Worker support (e.g. Node/Vitest), return result
  if (typeof Worker === 'undefined') {
    return Promise.resolve(fastCheck);
  }

  // 3. Delegate to Worker with hard timeout
  return new Promise((resolve) => {
    let worker: Worker;
    let timer: ReturnType<typeof setTimeout>;

    try {
      const workerUrl =
        typeof chrome !== 'undefined' && chrome?.runtime?.getURL
          ? chrome.runtime.getURL('assets/redosWorker.js')
          : new URL('./redos-worker.ts', import.meta.url);

      worker = new Worker(workerUrl, { type: 'module' });
    } catch {
      return resolve(fastCheck);
    }

    timer = setTimeout(() => {
      worker.terminate();
      resolve({
        valid: false,
        error: `Pattern rejected: execution exceeded ${timeoutMs}ms safety timeout (catastrophic backtracking / ReDoS)`,
      });
    }, timeoutMs);

    worker.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };

    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      resolve({
        valid: false,
        error: 'Regex execution error in validation worker (ReDoS risk)',
      });
    };

    worker.postMessage({ pattern });
  });
}

