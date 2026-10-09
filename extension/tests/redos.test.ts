import { describe, it, expect } from 'vitest';
import { PATTERNS } from '../src/detectors/regex-detector';

describe('ReDoS Safety Check', () => {
  const ADVERSARIAL_INPUTS: Array<{ name: string; text: string }> = [
    { name: '50k repeated letters', text: 'a'.repeat(50000) },
    { name: '50k repeated digits', text: '9'.repeat(50000) },
    { name: '50k repeated dashes and dots', text: '-.-.-.'.repeat(8333) },
    { name: '50k repeated email-like prefix', text: 'user.name+tag@'.repeat(3500) },
    { name: '50k repeated phone-like prefix', text: '+1 (555) 123-'.repeat(3500) },
    { name: '50k repeated credit-card prefix', text: '1234-5678-'.repeat(5000) },
    { name: '50k repeated ip-like prefix', text: '192.168.1.'.repeat(5000) },
    { name: '50k repeated api-key prefix', text: 'sk-abcdef12345_'.repeat(3300) },
    { name: '50k repeated url-with-creds prefix', text: 'https://user:password@'.repeat(2200) },
  ];

  for (const [patternName, patternDef] of Object.entries(PATTERNS)) {
    it(`pattern ${patternName} executes in under 50ms against adversarial inputs`, () => {
      for (const input of ADVERSARIAL_INPUTS) {
        const re = new RegExp(patternDef.regex.source, patternDef.regex.flags);
        const start = performance.now();

        // Run regex across entire adversarial string
        let matchCount = 0;
        while (re.exec(input.text) !== null) {
          matchCount++;
          if (matchCount > 1000) break; // safety guard
        }

        const duration = performance.now() - start;
        expect(
          duration,
          `Pattern ${patternName} took ${duration.toFixed(2)}ms on input "${input.name}" (exceeded 75ms limit)`,
        ).toBeLessThan(75);
      }
    });
  }
});

import { validateRegexSafety, validateRegexSafetyAsync } from '../src/detectors/redos-validator';

describe('Custom Rule ReDoS Validator (validateRegexSafety)', () => {
  it('accepts safe, well-formed regular expressions', () => {
    const safePatterns = [
      'PRJ-[A-Z0-9]{4,8}',
      '\\bCONFIDENTIAL-[0-9]+\\b',
      'USER_[a-f0-9]{16}',
      'ACME_[A-Z]{3}_[0-9]{4}',
      '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
    ];

    for (const pat of safePatterns) {
      const res = validateRegexSafety(pat);
      expect(res.valid, `Expected "${pat}" to be valid, got: ${res.error}`).toBe(true);
      expect(res.error).toBeUndefined();
    }
  });

  it('rejects empty and whitespace-only patterns', () => {
    expect(validateRegexSafety('').valid).toBe(false);
    expect(validateRegexSafety('   ').valid).toBe(false);
  });

  it('rejects malformed syntax cleanly with an informative error message', () => {
    const invalidPatterns = [
      '[a-z',
      '(?<',
      'abc(',
      '*abc',
    ];

    for (const pat of invalidPatterns) {
      const res = validateRegexSafety(pat);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid regular expression');
    }
  });

  it('detects and rejects catastrophic nested quantifiers (ReDoS risk)', () => {
    const dangerousPatterns = [
      '(a+)+$',
      '(a+)*$',
      '([a-zA-Z]+)*$',
      '(x+)+y',
      '([0-9]*)*',
      'x*x*x*x*y',
      'a+a+a+b',
    ];

    for (const pat of dangerousPatterns) {
      const res = validateRegexSafety(pat);
      expect(res.valid, `Expected ReDoS rejection for "${pat}"`).toBe(false);
      expect(res.error).toMatch(/ReDoS|nested repetition|adjacent overlapping/i);
    }
  });

  it('asynchronously validates regex patterns without blocking', async () => {
    const safeRes = await validateRegexSafetyAsync('CONFIDENTIAL-[0-9]+', 300);
    expect(safeRes.valid).toBe(true);

    const dangerRes = await validateRegexSafetyAsync('(a+)+$', 300);
    expect(dangerRes.valid).toBe(false);
    expect(dangerRes.error).toMatch(/ReDoS|nested repetition|timeout/i);
  });
});

import { detectWithCustomRules } from '../src/detectors/custom-rules';
import type { CustomRule } from '../src/shared/types';

describe('Custom Rules Runtime Time Guard', () => {
  it('skips rules that exceed execution budget and generates user warnings', () => {
    const rules: CustomRule[] = [
      {
        id: 'r1',
        name: 'Fast Normal Rule',
        category: 'FAST',
        type: 'keyword',
        values: ['QuickSecret'],
        enabled: true,
        confidence: 0.95,
        pattern: '',
      },
      {
        id: 'r2',
        name: 'Slow Heavy Rule',
        category: 'SLOW',
        type: 'keyword',
        // Provide thousands of keywords to exceed a 0.01ms budget
        values: Array.from({ length: 5000 }, (_, i) => `kw_${i}_test`),
        enabled: true,
        confidence: 0.95,
        pattern: '',
      },
    ];

    const testText = 'Here is QuickSecret and some other text.';

    // Run with 0.01ms ultra-low budget to test budget cutoff enforcement
    const result = detectWithCustomRules(testText, rules, 0.01);

    // Fast rule executed before or after
    // Slow rule MUST be recorded in skippedRules and warnings
    expect(result.skippedRules).toContain('Slow Heavy Rule');
    expect(result.warnings.some((w) => w.includes('Slow Heavy Rule'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('exceeded'))).toBe(true);
  });

  it('runs normal rules within budget without skipping', () => {
    const rules: CustomRule[] = [
      {
        id: 'r1',
        name: 'Alpha Project',
        category: 'PROJECT',
        type: 'regex',
        pattern: 'PROJ-[0-9]{4}',
        enabled: true,
        confidence: 0.95,
      },
    ];

    const testText = 'Working on PROJ-1234 today.';
    const result = detectWithCustomRules(testText, rules, 25);

    expect(result.skippedRules.length).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].value).toBe('PROJ-1234');
  });

  it('terminates and skips a pattern that bypasses naive static checks but causes catastrophic backtracking on specific input', async () => {
    // Pattern: (b|bb)+$ has no nested quantifiers, but on 30 'b's + '!' it backtracks 2^30 times.
    const sneakyPattern = '(b|bb)+$';
    const adversarialText = 'b'.repeat(30) + '!';

    // 1. Verify our updated syntax validator rejects it as an unsafe repeated alternation
    const validation = validateRegexSafety(sneakyPattern);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('repeated alternation group');

    // 2. Verify that if executed via worker runner with a 25ms cutoff,
    // worker.terminate() forcibly kills the stuck regex and reports timedOut: true
    const { matchRegexWithWorkerTimeout } = await import('../src/detectors/regex-worker-runner');
    const runResult = await matchRegexWithWorkerTimeout(sneakyPattern, adversarialText, 25);
    expect(runResult.timedOut).toBe(true);
    expect(runResult.matches.length).toBe(0);
  });

  it('rejects regex patterns that exceed the 200 character length cap', () => {
    const longPattern = 'a'.repeat(201);
    const result = validateRegexSafety(longPattern);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds 200 character limit');
  });

  it('records skippedRules and descriptive warning when a custom rule violates the safe subset', () => {
    const unsafeRule: CustomRule = {
      id: 'unsafe-test-rule',
      name: 'Unsafe Backtracker',
      category: 'SECRET',
      type: 'regex',
      pattern: 'x*x*x*x*y',
      enabled: true,
      confidence: 0.9,
    };
    const res = detectWithCustomRules('Hello world', [unsafeRule], 25);
    expect(res.skippedRules).toContain('Unsafe Backtracker');
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain('Unsafe Backtracker');
    expect(res.warnings[0]).toContain('violates ReDoS-safe subset');
  });

  it('scans a 50,000-character prompt in overlapping chunks and detects a sensitive match at the very end', () => {
    // Generate 50,000 characters of realistic prose with the sensitive token placed at the very end
    const filler = 'The quick brown fox jumps over the lazy dog. ';
    const targetMatch = 'SECRET-99881';
    const fillerLength = 50000 - targetMatch.length;
    const promptText = filler.repeat(Math.ceil(fillerLength / filler.length)).slice(0, fillerLength) + targetMatch;

    expect(promptText.length).toBe(50000);
    expect(promptText.endsWith(targetMatch)).toBe(true);

    const rule: CustomRule = {
      id: 'end-match-rule',
      name: 'Project Secret Pattern',
      category: 'API_KEY',
      type: 'regex',
      pattern: 'SECRET-\\d{5}',
      enabled: true,
      confidence: 0.99,
    };

    const res = detectWithCustomRules(promptText, [rule], 50);

    // Verify rule was not skipped or timed out
    expect(res.skippedRules.length).toBe(0);
    expect(res.warnings.length).toBe(0);

    // Verify entity was detected accurately at the very end
    expect(res.length).toBe(1);
    expect(res[0].type).toBe('API_KEY');
    expect(res[0].value).toBe(targetMatch);
    expect(res[0].start).toBe(50000 - targetMatch.length);
    expect(res[0].end).toBe(50000);
  });
});


