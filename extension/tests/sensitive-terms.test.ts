import { describe, it, expect } from 'vitest';
import { detectWithSensitiveTerms } from '../src/detectors/sensitive-terms';
import type { SensitiveTerm } from '../shared/types';

describe('Sensitive Terms Detector (detectWithSensitiveTerms)', () => {
  const terms: SensitiveTerm[] = [
    {
      id: 't1',
      term: 'Alice Smith',
      category: 'PERSON',
      enabled: true,
    },
    {
      id: 't2',
      term: 'Acme Corp',
      category: 'ORG',
      enabled: true,
    },
    {
      id: 't3',
      term: 'Project Titan',
      category: 'PROJECT',
      enabled: true,
    },
    {
      id: 't4',
      term: 'Valparaiso',
      category: 'LOCATION',
      enabled: true,
    },
    {
      id: 't5',
      term: 'Inactive Secret',
      category: 'PROJECT',
      enabled: false,
    },
  ];

  it('matches terms case-insensitively', () => {
    const text = 'Welcome to acme corp and ACME CORP today.';
    const results = detectWithSensitiveTerms(text, terms);
    expect(results.length).toBe(2);
    expect(results[0].value).toBe('acme corp');
    expect(results[0].type).toBe('ORG');
    expect(results[1].value).toBe('ACME CORP');
  });

  it('enforces whole-word matching without partial substring collisions', () => {
    // "Acme" is not configured alone, "Acme Corp" is.
    // "Smithsonian" should NOT match "Smith".
    // "Titanium" should NOT match "Titan".
    const text = 'The Smithsonian museum had titanium tools from Acme Corporation.';
    const results = detectWithSensitiveTerms(text, terms);
    expect(results.length).toBe(0);
  });

  it('matches possessive variants (\'s and curly ’s)', () => {
    const text = "Checking Acme Corp's servers and Project Titan’s timeline.";
    const results = detectWithSensitiveTerms(text, terms);
    expect(results.length).toBe(2);
    expect(results[0].value).toBe("Acme Corp's");
    expect(results[0].type).toBe('ORG');
    expect(results[1].value).toBe('Project Titan’s');
    expect(results[1].type).toBe('PROJECT');
  });

  it('matches last name alone when user adds a full personal name', () => {
    // "Alice Smith" is configured under PERSON
    const text = 'Meeting with Alice Smith this morning. Later, Smith confirmed the plan.';
    const results = detectWithSensitiveTerms(text, terms);
    expect(results.length).toBe(2);
    expect(results[0].value).toBe('Alice Smith');
    expect(results[0].type).toBe('PERSON');
    expect(results[1].value).toBe('Smith');
    expect(results[1].type).toBe('PERSON');
  });

  it('matches last name possessive variant alone for personal names', () => {
    const text = "Reviewing Smith's code and Smith’s notes.";
    const results = detectWithSensitiveTerms(text, terms);
    expect(results.length).toBe(2);
    expect(results[0].value).toBe("Smith's");
    expect(results[1].value).toBe('Smith’s');
  });

  it('matches location and assigns LOCATION category', () => {
    const text = 'Flight to Valparaiso was delayed.';
    const results = detectWithSensitiveTerms(text, terms);
    expect(results.length).toBe(1);
    expect(results[0].value).toBe('Valparaiso');
    expect(results[0].type).toBe('LOCATION');
  });

  it('ignores disabled terms', () => {
    const text = 'This involves Inactive Secret.';
    const results = detectWithSensitiveTerms(text, terms);
    expect(results.length).toBe(0);
  });

  it('handles empty text and empty terms gracefully', () => {
    expect(detectWithSensitiveTerms('', terms)).toEqual([]);
    expect(detectWithSensitiveTerms('Some text', [])).toEqual([]);
  });
});
