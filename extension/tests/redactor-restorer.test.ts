import { describe, it, expect } from 'vitest';
import { redact, deduplicateOverlaps } from '../src/core/redactor';
import { restore } from '../src/core/restorer';
import type { DetectedEntity, MappingEntry } from '../src/shared/types';

describe('Overlapping Detections Resolution', () => {
  it('resolves overlapping entities by prioritizing start index and match length', () => {
    const text = 'Contact: test@example.com';
    // Simulated overlapping entities: e.g. "test@example.com" (email) vs "example.com"
    const entities: DetectedEntity[] = [
      {
        type: 'DOMAIN',
        value: 'example.com',
        start: 14,
        end: 25,
        confidence: 0.8,
        source: 'regex',
      },
      {
        type: 'EMAIL',
        value: 'test@example.com',
        start: 9,
        end: 25,
        confidence: 0.95,
        source: 'regex',
      },
    ];

    const deduplicated = deduplicateOverlaps(entities);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].type).toBe('EMAIL');
    expect(deduplicated[0].value).toBe('test@example.com');
  });

  it('keeps non-overlapping adjacent entities', () => {
    const entities: DetectedEntity[] = [
      {
        type: 'IPV4',
        value: '192.168.1.1',
        start: 0,
        end: 11,
        confidence: 0.9,
        source: 'regex',
      },
      {
        type: 'IPV4',
        value: '10.0.0.1',
        start: 15,
        end: 23,
        confidence: 0.9,
        source: 'regex',
      },
    ];

    const deduplicated = deduplicateOverlaps(entities);
    expect(deduplicated.length).toBe(2);
  });
});

describe('Redaction & Restoration Round-Trip', () => {
  it('redacts multiple entities and restores them back to original text', () => {
    const originalText = 'Email user@example.com or call +1-555-123-4567 for server 192.168.1.10.';
    const entities: DetectedEntity[] = [
      {
        type: 'EMAIL',
        value: 'user@example.com',
        start: 6,
        end: 22,
        confidence: 0.95,
        source: 'regex',
      },
      {
        type: 'PHONE',
        value: '+1-555-123-4567',
        start: 31,
        end: 46,
        confidence: 0.9,
        source: 'regex',
      },
      {
        type: 'IPV4',
        value: '192.168.1.10',
        start: 58,
        end: 70,
        confidence: 0.9,
        source: 'regex',
      },
    ];

    const { redactedText, mappings } = redact(originalText, entities);

    expect(redactedText).toContain('«EMAIL_1»');
    expect(redactedText).toContain('«PHONE_1»');
    expect(redactedText).toContain('«IPV4_1»');
    expect(redactedText).not.toContain('user@example.com');
    expect(redactedText).not.toContain('+1-555-123-4567');
    expect(redactedText).not.toContain('192.168.1.10');

    // Round trip restoration
    const restoredText = restore(redactedText, mappings);
    expect(restoredText).toBe(originalText);
  });
});

describe('Placeholder Reuse Across Messages in Same Conversation', () => {
  it('reuses identical placeholder for the same entity in follow-up messages', () => {
    // Message 1
    const msg1 = 'Please email alice@company.com with the report.';
    const ent1: DetectedEntity[] = [
      {
        type: 'EMAIL',
        value: 'alice@company.com',
        start: 13,
        end: 30,
        confidence: 0.95,
        source: 'regex',
      },
    ];
    const res1 = redact(msg1, ent1, []);
    expect(res1.redactedText).toBe('Please email «EMAIL_1» with the report.');
    expect(res1.mappings.length).toBe(1);

    // Message 2: mentions alice@company.com again plus a new person bob@company.com
    const msg2 = 'Also cc alice@company.com and bob@company.com on that.';
    const ent2: DetectedEntity[] = [
      {
        type: 'EMAIL',
        value: 'alice@company.com',
        start: 8,
        end: 25,
        confidence: 0.95,
        source: 'regex',
      },
      {
        type: 'EMAIL',
        value: 'bob@company.com',
        start: 30,
        end: 45,
        confidence: 0.95,
        source: 'regex',
      },
    ];

    // Pass existing mappings from Message 1
    const res2 = redact(msg2, ent2, res1.mappings);

    // alice@company.com MUST reuse «EMAIL_1», and bob gets «EMAIL_2»
    expect(res2.redactedText).toBe('Also cc «EMAIL_1» and «EMAIL_2» on that.');
    expect(res2.mappings.length).toBe(2);

    // Both messages can be restored with the updated mappings
    expect(restore(res1.redactedText, res2.mappings)).toBe(msg1);
    expect(restore(res2.redactedText, res2.mappings)).toBe(msg2);
  });
});

describe('Fuzzy / Resilient Restoration', () => {
  const mappings: MappingEntry[] = [
    {
      placeholder: '«PERSON_1»',
      original: 'Alice Smith',
      type: 'PERSON',
    },
    {
      placeholder: '«API_KEY_1»',
      original: 'sk-abcdef1234567890',
      type: 'API_KEY',
    },
  ];

  it('restores placeholders with extra spaces inside guillemets', () => {
    const aiOutput = 'Hello « PERSON_1 » and «  API_KEY_1  »';
    const restored = restore(aiOutput, mappings);
    expect(restored).toBe('Hello Alice Smith and sk-abcdef1234567890');
  });

  it('restores placeholders when AI replaces guillemets with brackets', () => {
    const aiOutput = 'Contact [PERSON_1] using key [API_KEY_1]';
    const restored = restore(aiOutput, mappings);
    expect(restored).toBe('Contact Alice Smith using key sk-abcdef1234567890');
  });

  it('restores bare placeholders without delimiters', () => {
    const aiOutput = 'We should inform PERSON_1 about this.';
    const restored = restore(aiOutput, mappings);
    expect(restored).toBe('We should inform Alice Smith about this.');
  });

  it('restores placeholders where underscore was converted to space', () => {
    const aiOutput = 'Hello « PERSON 1 », welcome.';
    const restored = restore(aiOutput, mappings);
    expect(restored).toBe('Hello Alice Smith, welcome.');
  });
});

describe('French Quotations & Guillemet Safety', () => {
  it('does NOT corrupt normal non-placeholder text containing « »', () => {
    const mappings: MappingEntry[] = [
      {
        placeholder: '«EMAIL_1»',
        original: 'test@example.com',
        type: 'EMAIL',
      },
    ];

    const frenchText = 'Le président a dit: « Bonjour à tous et bienvenue dans notre pays! » Contactez «EMAIL_1».';
    const restored = restore(frenchText, mappings);

    // The French quotation « Bonjour à tous et bienvenue dans notre pays! » must remain intact!
    expect(restored).toContain('« Bonjour à tous et bienvenue dans notre pays! »');
    // Only the actual placeholder was restored
    expect(restored).toContain('Contactez test@example.com.');
  });
});
