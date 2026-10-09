import { describe, it, expect } from 'vitest';
import {
  detectWithRegex,
  luhnCheck,
  isValidIPv4,
} from '../src/detectors/regex-detector';
import { detectWithCustomRules } from '../src/detectors/custom-rules';
import type { CustomRule } from '../src/shared/types';

describe('Regex Detectors — Positive and Negative Cases', () => {
  it('detects valid EMAIL and ignores invalid emails', () => {
    const text = 'Reach me at user.name+tag@sub.domain.org or info@company.co, but not plain-string or @missing.com';
    const entities = detectWithRegex(text).filter((e) => e.type === 'EMAIL');
    expect(entities.length).toBe(2);
    expect(entities[0].value).toBe('user.name+tag@sub.domain.org');
    expect(entities[1].value).toBe('info@company.co');
  });

  it('detects PHONE numbers and ignores short digit sequences', () => {
    const text = 'Call +1-800-555-0199 or (555) 234-5678, not 12345 or item #98765';
    const entities = detectWithRegex(text).filter((e) => e.type === 'PHONE');
    expect(entities.length).toBeGreaterThanOrEqual(2);
    expect(entities.some((e) => e.value.includes('555-0199'))).toBe(true);
    expect(entities.some((e) => e.value === '12345')).toBe(false);
  });

  it('detects CNIC numbers and ignores invalid formats', () => {
    const text = 'ID: 35202-1234567-1 and bad CNIC: 35202-12345-1';
    const entities = detectWithRegex(text).filter((e) => e.type === 'CNIC');
    expect(entities.length).toBe(1);
    expect(entities[0].value).toBe('35202-1234567-1');
  });

  it('detects API keys (OpenAI, AWS, GitHub)', () => {
    const text = 'Keys: sk-abcdef1234567890abcdef123456, AKIAIOSFODNN7EXAMPLE, ghp_123456789012345678901234567890123456';
    const entities = detectWithRegex(text).filter((e) => e.type === 'API_KEY');
    expect(entities.length).toBe(3);
  });

  it('detects CREDIT_CARD with Luhn validation', () => {
    // 4532-0150-0000-0007 is a valid Luhn card number
    const validCard = '4532-0150-0000-0007';
    const invalidCard = '4532-0150-0000-0002'; // invalid checksum
    const text = `Valid: ${validCard}, Invalid: ${invalidCard}`;
    const entities = detectWithRegex(text).filter((e) => e.type === 'CREDIT_CARD');
    expect(entities.length).toBe(1);
    expect(entities[0].value).toBe(validCard);
  });

  it('detects SSN numbers', () => {
    const text = 'SSN is 123-45-6789, not 12-345-6789';
    const entities = detectWithRegex(text).filter((e) => e.type === 'SSN');
    expect(entities.length).toBe(1);
    expect(entities[0].value).toBe('123-45-6789');
  });

  it('detects IPV4 with octet validation', () => {
    const text = 'Servers: 192.168.1.1 and 10.0.0.254, but not 999.1.1.1 or 256.0.0.1';
    const entities = detectWithRegex(text).filter((e) => e.type === 'IPV4');
    expect(entities.length).toBe(2);
    expect(entities[0].value).toBe('192.168.1.1');
    expect(entities[1].value).toBe('10.0.0.254');
  });

  it('detects IPV6 addresses', () => {
    const text = 'Host 2001:0db8:85a3:0000:0000:8a2e:0370:7334 is active';
    const entities = detectWithRegex(text).filter((e) => e.type === 'IPV6');
    expect(entities.length).toBe(1);
    expect(entities[0].value).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
  });

  it('detects MAC_ADDRESS', () => {
    const text = 'Adapter: 00:1A:2B:3C:4D:5E and 00-14-22-01-23-45';
    const entities = detectWithRegex(text).filter((e) => e.type === 'MAC_ADDRESS');
    expect(entities.length).toBe(2);
  });

  it('detects URL_WITH_CREDS', () => {
    const text = 'Connect to https://admin:secret123@db.example.com/data but normal https://example.com/data';
    const entities = detectWithRegex(text).filter((e) => e.type === 'URL_WITH_CREDS');
    expect(entities.length).toBe(1);
    expect(entities[0].value).toBe('https://admin:secret123@db.example.com/data');
  });

  it('detects DATE_OF_BIRTH', () => {
    const text = 'Born on 12/31/1990 or 05-20-1985, not 99/99/9999';
    const entities = detectWithRegex(text).filter((e) => e.type === 'DATE_OF_BIRTH');
    expect(entities.length).toBe(2);
  });
});

describe('Luhn Validation Edge Cases', () => {
  it('validates correct card numbers', () => {
    expect(luhnCheck('4532015000000007')).toBe(true);
    expect(luhnCheck('4532 0150 0000 0007')).toBe(true);
    // Standard test visa: 4000 0012 3456 7899
    expect(luhnCheck('4000001234567899')).toBe(true);
  });

  it('rejects incorrect checksums', () => {
    expect(luhnCheck('4532015000000000')).toBe(false);
    expect(luhnCheck('4532015000000001')).toBe(false);
    expect(luhnCheck('4532015000000002')).toBe(false);
  });

  it('rejects numbers that are too short or too long', () => {
    expect(luhnCheck('123456789012')).toBe(false); // 12 digits (< 13)
    expect(luhnCheck('12345678901234567890')).toBe(false); // 20 digits (> 19)
    expect(luhnCheck('')).toBe(false);
    expect(luhnCheck('abc')).toBe(false);
  });
});

describe('IPv4 Validation Edge Cases', () => {
  it('validates boundary valid IPs', () => {
    expect(isValidIPv4('0.0.0.0')).toBe(true);
    expect(isValidIPv4('255.255.255.255')).toBe(true);
    expect(isValidIPv4('127.0.0.1')).toBe(true);
  });

  it('rejects octets above 255 or below 0', () => {
    expect(isValidIPv4('256.0.0.1')).toBe(false);
    expect(isValidIPv4('192.168.1.300')).toBe(false);
    expect(isValidIPv4('10.256.0.1')).toBe(false);
  });

  it('rejects non-4-octet inputs', () => {
    expect(isValidIPv4('1.2.3')).toBe(false);
    expect(isValidIPv4('1.2.3.4.5')).toBe(false);
    expect(isValidIPv4('1.2.3.a')).toBe(false);
    expect(isValidIPv4('')).toBe(false);
  });
});

describe('Custom Rules Detector', () => {
  const rules: CustomRule[] = [
    {
      id: 'rule-1',
      name: 'Project Codename',
      type: 'keyword',
      pattern: '',
      values: ['Project Orion', 'Zeus'],
      category: 'PROJECT',
      enabled: true,
      confidence: 0.95,
    },
    {
      id: 'rule-2',
      name: 'Internal ID Pattern',
      type: 'regex',
      pattern: '\\bEMP-[0-9]{4}\\b',
      category: 'EMPLOYEE_ID',
      enabled: true,
      confidence: 0.99,
    },
    {
      id: 'rule-3',
      name: 'Disabled Rule',
      type: 'keyword',
      pattern: '',
      values: ['Confidential'],
      category: 'SECRET',
      enabled: false,
      confidence: 0.99,
    },
  ];

  it('detects custom keyword and regex rules', () => {
    const text = 'Welcome to Project Orion. Employee EMP-5432 reported to Zeus. Confidential info.';
    const entities = detectWithCustomRules(text, rules);

    expect(entities.length).toBe(3);
    expect(entities.some((e) => e.value === 'Project Orion' && e.type === 'PROJECT')).toBe(true);
    expect(entities.some((e) => e.value === 'EMP-5432' && e.type === 'EMPLOYEE_ID')).toBe(true);
    expect(entities.some((e) => e.value === 'Zeus' && e.type === 'PROJECT')).toBe(true);
    // Disabled rule should not match
    expect(entities.some((e) => e.value === 'Confidential')).toBe(false);
  });
});

describe('Gazetteer & Context Rule NER Detector', () => {
  it('detects diverse global names, organizations, and locations', async () => {
    const { detectWithNer } = await import('../src/detectors/ner-detector');

    const text = 'Dr. Tariq Mehmood met with Sarah Jenkins and Sundar Pichai at OpenAI in Tokyo.';
    const entities = await detectWithNer(text);

    expect(entities.some((e) => e.type === 'PERSON' && e.value.includes('Tariq Mehmood'))).toBe(true);
    expect(entities.some((e) => e.type === 'PERSON' && e.value.includes('Sarah Jenkins'))).toBe(true);
    expect(entities.some((e) => e.type === 'PERSON' && e.value.includes('Sundar Pichai'))).toBe(true);
    expect(entities.some((e) => e.type === 'ORG' && e.value === 'OpenAI')).toBe(true);
    expect(entities.some((e) => e.type === 'LOCATION' && e.value === 'Tokyo')).toBe(true);
  });

  it('respects sensitivity mapping: low requires context cue, high captures multi-word proper nouns', async () => {
    const { detectWithNer } = await import('../src/detectors/ner-detector');

    // "Tariq Mehmood" has first + last name in gazetteer.
    // "Acme Corp" has org suffix cue.
    // "UnkownPerson MysteryName" is not in gazetteer and not sentence-initial.
    const text = 'Tariq Mehmood visited Acme Corp, and later UnkownPerson MysteryName attended the lecture.';

    const lowEntities = await detectWithNer(text, { sensitivity: 'low' });
    expect(lowEntities.some((e) => e.type === 'ORG' && e.value.includes('Acme Corp'))).toBe(true);

    const highEntities = await detectWithNer(text, { sensitivity: 'high' });
    expect(highEntities.some((e) => e.value.includes('UnkownPerson MysteryName'))).toBe(true);
  });

  it('filters out code identifiers and file paths', async () => {
    const { detectWithNer } = await import('../src/detectors/ner-detector');

    const text = 'const userId = getUserProfile(targetId); and log at C:\\Users\\Alice\\Documents\\app.log';
    const entities = await detectWithNer(text);

    expect(entities.some((e) => e.value === 'userId')).toBe(false);
    expect(entities.some((e) => e.value === 'getUserProfile')).toBe(false);
    expect(entities.some((e) => e.value === 'Alice')).toBe(false);
  });

  it('filters out sentence-initial words', async () => {
    const { detectWithNer } = await import('../src/detectors/ner-detector');

    const text = 'However, the system worked. Because of the updates, we succeeded.';
    const entities = await detectWithNer(text);

    expect(entities.some((e) => e.value === 'However')).toBe(false);
    expect(entities.some((e) => e.value === 'Because')).toBe(false);
  });

  it('allows swapping NerBackend via pluggable interface', async () => {
    const { detectWithNer, setNerBackend, getNerBackend } = await import('../src/detectors/ner-detector');
    const original = getNerBackend();

    const mockBackend = {
      name: 'mock-test-backend',
      detect: async () => [{
        type: 'PERSON',
        value: 'Mock Person',
        start: 0,
        end: 11,
        confidence: 0.99,
        source: 'ner' as const,
      }],
    };

    setNerBackend(mockBackend);
    const results = await detectWithNer('Hello world');
    expect(results.length).toBe(1);
    expect(results[0].value).toBe('Mock Person');

    // Restore original
    setNerBackend(original);
  });

  it('verifies expanded gazetteer meets < 3 MB size budget', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const triePath = path.resolve(__dirname, '../src/detectors/gazetteer-data.json');
    const stats = fs.statSync(triePath);
    const sizeBytes = stats.size;
    const sizeMB = sizeBytes / (1024 * 1024);

    expect(sizeMB).toBeLessThan(3.0);
    expect(sizeBytes).toBeGreaterThan(100 * 1024); // Confirms expanded beyond tiny seed list
  });

  it('achieves 0% False Positive Rate across 30 benign prompts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { detectWithNer } = await import('../src/detectors/ner-detector');

    const benignPath = path.resolve(__dirname, 'data/benign-prompts.json');
    const benignPrompts: Array<{ id: string; text: string }> = JSON.parse(
      fs.readFileSync(benignPath, 'utf8'),
    );

    expect(benignPrompts.length).toBe(30);

    const falsePositives: Array<{ id: string; text: string; detected: string[] }> = [];
    for (const prompt of benignPrompts) {
      const entities = await detectWithNer(prompt.text, { sensitivity: 'medium' });
      if (entities.length > 0) {
        falsePositives.push({
          id: prompt.id,
          text: prompt.text,
          detected: entities.map((e) => e.value),
        });
      }
    }

    expect(falsePositives, `Benign prompts must have 0 false positives: ${JSON.stringify(falsePositives)}`).toHaveLength(0);
  });

  it('evaluates unknown entities on 0% overlap held-out set and captures out-of-vocabulary entities via context rules', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { detectWithNer } = await import('../src/detectors/ner-detector');

    const unkPath = path.resolve(__dirname, 'data/unknown-entities-eval.json');
    const unkPrompts: Array<{ id: string; text: string; entities: Array<{ text: string; category: string }> }> =
      JSON.parse(fs.readFileSync(unkPath, 'utf8'));

    expect(unkPrompts.length).toBe(34);

    let highSensitivityHits = 0;
    for (const prompt of unkPrompts) {
      const entities = await detectWithNer(prompt.text, { sensitivity: 'high' });
      if (entities.length > 0) {
        highSensitivityHits++;
      }
    }

    // High sensitivity context rules should successfully detect out-of-vocabulary entities
    expect(highSensitivityHits).toBeGreaterThanOrEqual(10);
  });
});
