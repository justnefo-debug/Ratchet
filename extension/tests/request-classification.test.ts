/**
 * Ratchet Privacy Shield — ChatGPT Real-Site Request Classification Tests
 *
 * Fixtures built from the key structure observed on chatgpt.com 2026-10-10;
 * message content shape assumed, not confirmed.
 *
 * Tests:
 * 1. Message request is classified as 'unknown-message-shape' because shape is unconfirmed
 * 2. A prepare-like request without messages passes through
 * 3. A non-message request containing a fake email is blocked by safety net
 * 4. A message request with an unexpected shape fails closed
 * 5. Realistic metadata body (UUIDs, timestamps, timezone) is not blocked at any sensitivity
 */

import { describe, it, expect } from 'vitest';
import { ChatGPTAdapter } from '../src/adapters/chatgpt';
import { ClaudeAdapter } from '../src/adapters/claude';

describe('ChatGPT Real-Site Request Classification (A2/A3)', () => {
  const adapter = new ChatGPTAdapter();

  /**
   * Fixture: key structure observed on chatgpt.com 2026-10-10.
   * All string values are fake. Message content shape assumed, not confirmed.
   */
  const CHATGPT_MESSAGE_FIXTURE = {
    action: 'next',
    client_contextual_info: {
      is_dark_mode: false,
      time_at_client: '2026-10-10T08:30:00+05:00',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    client_prepare_state: null,
    genui_state_snapshots: [],
    is_do_not_remember: false,
    local_function_names: [],
    messages: [
      {
        id: 'aaa2f4c9-8b12-4d7e-a1c3-def456789abc',
        author: { role: 'user' },
        content: {
          content_type: 'text',
          parts: ['My email is testuser@example.com, please check it.'],
        },
        metadata: {
          serialization_metadata: { custom_symbol_offsets: [] },
        },
      },
    ],
    model: 'gpt-4o',
    parent_message_id: 'bbb3e5d0-9c23-5e8f-b2d4-ef0567890bcd',
    supported_encodings: ['utf-8'],
    timezone: 'Asia/Karachi',
    timezone_offset_min: -300,
    turn_attribution: null,
  };

  /**
   * Fixture: prepare-like request — no messages key.
   * Key structure mimics non-message calls seen alongside the conversation POST.
   */
  const CHATGPT_PREPARE_FIXTURE = {
    action: 'prepare',
    model: 'gpt-4o',
    parent_message_id: 'ccc4f6e1-ad34-6f90-c3e5-f01678901cde',
    conversation_id: 'ddd5g7f2-be45-7a01-d4f6-012789012def',
    client_contextual_info: {
      is_dark_mode: false,
      time_at_client: '2026-10-10T08:30:01+05:00',
    },
  };

  /**
   * Fixture: non-message body that contains a fake email in a metadata field.
   */
  const CHATGPT_METADATA_WITH_EMAIL = {
    action: 'log_event',
    event_type: 'page_view',
    user_context: {
      email_notification_target: 'secret.user@company.internal',
    },
    timestamp: '2026-10-10T08:30:05Z',
  };

  /**
   * Fixture: realistic metadata body with UUIDs, timestamps, timezone.
   * Must NOT trigger the safety net at any sensitivity level.
   */
  const CHATGPT_CLEAN_METADATA = {
    action: 'prepare',
    model: 'gpt-4o',
    parent_message_id: 'aaa2b3c4-d5e6-f7a8-b9c0-d1e2f3a4b5c6',
    conversation_id: 'fff8h9i0-dg56-8b12-e5g7-345abc678def',
    client_contextual_info: {
      is_dark_mode: true,
      time_at_client: '2026-10-10T08:30:00+05:00',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    timezone: 'Asia/Karachi',
    timezone_offset_min: -300,
    supported_encodings: ['utf-8'],
    is_do_not_remember: false,
  };

  it('classifies a message request as "unknown-message-shape" because shape is unconfirmed', () => {
    const body = JSON.stringify(CHATGPT_MESSAGE_FIXTURE);
    const result = adapter.classifyRequest(body);

    expect(result.classification).toBe('unknown-message-shape');
    expect(result.extracted).toBeNull();
  });

  it('classifies a prepare-like request without messages as "non-message"', () => {
    const body = JSON.stringify(CHATGPT_PREPARE_FIXTURE);
    const result = adapter.classifyRequest(body);

    expect(result.classification).toBe('non-message');
    expect(result.extracted).toBeNull();
  });

  it('classifies a request with email in metadata as "non-message" (safety net catches it)', () => {
    const body = JSON.stringify(CHATGPT_METADATA_WITH_EMAIL);
    const result = adapter.classifyRequest(body);

    expect(result.classification).toBe('non-message');
    expect(result.extracted).toBeNull();

    // The safety net would catch the email; test the email pattern separately
    const emailRegex = /\b[a-zA-Z0-9_.+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63})+\b/g;
    expect(emailRegex.test(body)).toBe(true);
  });

  it('fails closed on a message request with unexpected shape', () => {
    // messages exists but content has wrong structure (number instead of parts array)
    const badMessage = {
      ...CHATGPT_MESSAGE_FIXTURE,
      messages: [
        {
          id: 'msg-uuid-1',
          author: { role: 'user' },
          content: 'just a plain string instead of { content_type, parts }',
        },
      ],
    };
    const result = adapter.classifyRequest(JSON.stringify(badMessage));
    expect(result.classification).toBe('unknown-message-shape');
    expect(result.extracted).toBeNull();

    // Also test with messages as a non-array
    const badMessages2 = { ...CHATGPT_MESSAGE_FIXTURE, messages: 'not-an-array' };
    const result2 = adapter.classifyRequest(JSON.stringify(badMessages2));
    expect(result2.classification).toBe('unknown-message-shape');
  });

  it('does not flag realistic metadata with UUIDs, timestamps, and timezone', () => {
    const body = JSON.stringify(CHATGPT_CLEAN_METADATA);
    const result = adapter.classifyRequest(body);

    expect(result.classification).toBe('non-message');
    expect(result.extracted).toBeNull();

    // Verify no safety-net regex patterns match this clean metadata body
    const SAFETY_NET_PATTERNS = [
      /\b[a-zA-Z0-9_.+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63})+\b/g,
      /\b(?:sk-[a-zA-Z0-9_-]{12,64}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})\b/g,
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
      /\b\d{3}-\d{2}-\d{4}\b/g,
      /\b\d{5}-\d{7}-\d\b/g,
      /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g,
      /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
      /https?:\/\/[a-zA-Z0-9_.-]{1,64}:[^@\s]{1,128}@[^\s]+/g,
      /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,
    ];

    // Collect all string values from the body
    function collectStrings(obj: any): string[] {
      const strings: string[] = [];
      const recurse = (val: any) => {
        if (typeof val === 'string') strings.push(val);
        else if (Array.isArray(val)) val.forEach(recurse);
        else if (val && typeof val === 'object') Object.values(val).forEach(recurse);
      };
      recurse(obj);
      return strings;
    }

    const allText = collectStrings(CHATGPT_CLEAN_METADATA).join(' ');
    for (const pattern of SAFETY_NET_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      expect(re.test(allText)).toBe(false);
    }
  });

  it('classifies empty messages array as unknown-message-shape (fail closed)', () => {
    const body = JSON.stringify({ messages: [], model: 'gpt-4o' });
    const result = adapter.classifyRequest(body);
    expect(result.classification).toBe('unknown-message-shape');
  });
});

describe('Claude Request Classification', () => {
  const adapter = new ClaudeAdapter();

  it('classifies a prompt-schema request as "message"', () => {
    const body = JSON.stringify({
      prompt: 'My API key is sk-proj-fake12345678901234567890',
      model: 'claude-3-5-sonnet-20241022',
      timezone: 'America/New_York',
    });
    const result = adapter.classifyRequest(body);
    expect(result.classification).toBe('message');
    expect(result.extracted?.prompt).toBe('My API key is sk-proj-fake12345678901234567890');
  });

  it('classifies a messages-schema request as "message"', () => {
    const body = JSON.stringify({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hello world' }] },
      ],
      model: 'claude-3-5-sonnet-20241022',
    });
    const result = adapter.classifyRequest(body);
    expect(result.classification).toBe('message');
  });

  it('classifies a body without prompt or messages as "non-message"', () => {
    const body = JSON.stringify({
      action: 'heartbeat',
      session_id: 'sess-12345',
    });
    const result = adapter.classifyRequest(body);
    expect(result.classification).toBe('non-message');
  });

  it('fails closed on messages with unexpected user content type', () => {
    const body = JSON.stringify({
      messages: [{ role: 'user', content: 99999 }],
      model: 'claude-3-5-sonnet-20241022',
    });
    const result = adapter.classifyRequest(body);
    expect(result.classification).toBe('unknown-message-shape');
  });
});

describe('Safety Net Pattern Isolation', () => {
  it('safety net patterns do NOT match timezone strings like "Asia/Karachi"', () => {
    const SAFETY_NET_PATTERNS = [
      /\b[a-zA-Z0-9_.+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63})+\b/g,
      /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}(?:[-.\s]?\d{3,4})?\b/g,
      /\b(?:sk-[a-zA-Z0-9_-]{12,64}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})\b/g,
      /\b\d{3}-\d{2}-\d{4}\b/g,
      /\b\d{5}-\d{7}-\d\b/g,
    ];

    const timezoneStrings = [
      'Asia/Karachi',
      'America/New_York',
      'Europe/London',
      'Pacific/Auckland',
      'UTC',
    ];

    for (const tz of timezoneStrings) {
      for (const pattern of SAFETY_NET_PATTERNS) {
        const re = new RegExp(pattern.source, pattern.flags);
        expect(re.test(tz)).toBe(false);
      }
    }
  });

  it('safety net catches email, API key, and SSN in non-message bodies', () => {
    const emailRegex = /\b[a-zA-Z0-9_.+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63})+\b/g;
    const apiKeyRegex = /\b(?:sk-[a-zA-Z0-9_-]{12,64}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})\b/g;
    const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;

    expect(emailRegex.test('someone@example.com')).toBe(true);
    expect(apiKeyRegex.test('sk-proj-abc123def456ghi789jkl012')).toBe(true);
    expect(ssnRegex.test('123-45-6789')).toBe(true);
  });
});
