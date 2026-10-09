import { describe, it, expect } from 'vitest';
import { detectWithRegex } from '../src/detectors/regex-detector';
import { detectWithCustomRules } from '../src/detectors/custom-rules';
import { redact, deduplicateOverlaps } from '../src/core/redactor';
import type { CustomRule } from '../src/shared/types';

describe('Performance Benchmark', () => {
  const customRules: CustomRule[] = [
    {
      id: 'c1',
      name: 'Project Codename',
      type: 'keyword',
      pattern: '',
      values: ['QuantumLeap', 'HydraCore', 'Blackstone'],
      category: 'PROJECT',
      enabled: true,
      confidence: 0.95,
    },
    {
      id: 'c2',
      name: 'Internal Server ID',
      type: 'regex',
      pattern: '\\bSRV-[A-Z0-9]{5}\\b',
      category: 'SERVER_ID',
      enabled: true,
      confidence: 0.98,
    },
  ];

  // A realistic 500-word prompt with various sensitive entities embedded throughout
  const PROMPT_500_WORDS = `
Hello ChatGPT, I am preparing an incident report regarding a security breach that occurred on our internal network on 10/05/2026.
Our primary engineer John Doe (reachable at j.doe@company.example.com or mobile +1-555-876-5432) noticed anomalous network activity
originating from external IP address 198.51.100.45 and routing towards internal cluster host 10.240.12.88 at 03:15 UTC.
The intruder attempted to authenticate against database server SRV-DB091 using leaked credentials found in public repository.
The connection string utilized was https://dbadmin:superSecretP@ssw0rd!@internal-db.example.com:5432/production.
Upon inspecting the access logs, our security team detected that an exposed API token sk-proj-1234567890abcdef1234567890abcdef12345678
was used to make unauthorized requests against our private endpoint.
Furthermore, during the compromise, a test transaction file containing customer records was downloaded.
This file included sensitive customer details such as social security number 123-45-6789 belonging to customer Alice,
national identity number 35202-1234567-1, and corporate credit card 4532-0150-0000-0000 with expiration date 12/28.
The customer's date of birth was recorded as 04/15/1988.
The network interface involved had hardware MAC address 00:1A:2B:3C:4D:5E connected to switch port 4.
The affected subsystem is part of Project QuantumLeap, which integrates with the HydraCore microservice architecture.
Another engineer, Sarah Connor (s.connor@defense.example.org, phone (415) 555-0144), immediately revoked the compromised token
and rotated the secret keys across all affected nodes.
She also isolated secondary host 172.16.254.1 and server SRV-APP02 to prevent lateral movement within the cloud environment.
We need you to analyze this sequence of events, summarize the threat vector, and draft an executive post-mortem.
Please evaluate whether the compromised credentials could have granted access to our secondary backup infrastructure.
Additionally, provide recommendations on implementing strict rate-limiting, least-privilege identity access management,
and automated anomaly detection for outbound connections.
Make sure to format the recommendations as a bulleted checklist with estimated priority levels and mitigation steps.
We also need a formal customer notification template explaining that their payment information and SSN were safeguarded.
Please structure your answer logically, highlighting immediate containment actions taken, root cause analysis,
and long-term preventive measures to ensure our compliance with SOC2 and ISO27001 standards.
Thank you for your assistance in drafting this comprehensive report.
`.trim();

  it('completes detection and redaction of 500-word prompt in well under 100ms', () => {
    const wordCount = PROMPT_500_WORDS.split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(300); // Verify realistic length

    const t0 = performance.now();

    // 1. Regex detection
    const regexEntities = detectWithRegex(PROMPT_500_WORDS);

    // 2. Custom rules detection
    const customEntities = detectWithCustomRules(PROMPT_500_WORDS, customRules);

    // 3. Interval deduplication
    const allEntities = deduplicateOverlaps([...regexEntities, ...customEntities]);

    // 4. Redaction
    const result = redact(PROMPT_500_WORDS, allEntities);

    const duration = performance.now() - t0;

    console.log(`\n========================================`);
    console.log(`⏱️ 500-Word Prompt Benchmark Result:`);
    console.log(`   Word count: ${wordCount} words`);
    console.log(`   Entities detected & redacted: ${result.mappings.length}`);
    console.log(`   Total execution time: ${duration.toFixed(2)} ms (target: < 100 ms)`);
    console.log(`========================================\n`);

    // Verify entities were detected and redacted
    expect(result.mappings.length).toBeGreaterThanOrEqual(10);
    expect(result.redactedText).toContain('«EMAIL_');
    expect(result.redactedText).toContain('«PHONE_');
    expect(result.redactedText).toContain('«IPV4_');
    expect(result.redactedText).toContain('«API_KEY_');
    expect(result.redactedText).toContain('«PROJECT_');

    // Strict performance assertion: well under 100ms target
    expect(duration).toBeLessThan(100);
  });
});
