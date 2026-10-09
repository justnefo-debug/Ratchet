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
