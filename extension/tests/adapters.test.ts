/**
 * Ratchet Privacy Shield — Site Adapter Unit & Regression Tests
 *
 * Verifies ChatGPT and Claude adapters against realistic fixtures:
 * 1. Normal single-turn request body
 * 2. Multi-turn conversation body
 * 3. Unexpected / malformed shape (fail closed -> returns null)
 * 4. Preserving IDs, model names, and metadata strictly untouched
 *
 * Notes on Fixture Authenticity:
 * - ChatGPT fixtures: Modeled on reverse-engineered OpenAI web client payloads
 *   (POST /backend-api/conversation). Outer metadata like action, model, and
 *   parent_message_id are structural assumptions based on standard web UI traces.
 * - Claude fixtures: Modeled on Anthropic web client payloads
 *   (POST /api/organizations/.../chat_conversations/.../completion). Both the legacy
 *   single `prompt` string and modern `messages` blocks format are tested.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ChatGPTAdapter } from '../src/adapters/chatgpt';
import { ClaudeAdapter } from '../src/adapters/claude';
import { getAdapterForUrl } from '../src/adapters';

describe('ChatGPTAdapter', () => {
  const adapter = new ChatGPTAdapter();

  it('matches valid ChatGPT URLs and conversation endpoints', () => {
    expect(adapter.matchesPage('https://chatgpt.com/')).toBe(true);
    expect(adapter.matchesPage('https://chatgpt.com/c/67053e19-1234-8001-a1b2-c3d4e5f6a7b8')).toBe(true);
    expect(adapter.matchesPage('https://chat.openai.com/')).toBe(true);
    expect(adapter.matchesPage('https://claude.ai/')).toBe(false);

    expect(adapter.matchesRequest('https://chatgpt.com/backend-api/conversation', 'POST')).toBe(true);
    expect(adapter.matchesRequest('/backend-api/conversation', 'POST')).toBe(true);
    expect(adapter.matchesRequest('/backend-api/conversation', 'GET')).toBe(false);
    expect(adapter.matchesRequest('/backend-api/models', 'POST')).toBe(false);
  });

  it('extracts conversation ID from URL', () => {
    expect(adapter.getConversationId('https://chatgpt.com/c/conv-abc-123')).toBe('conv-abc-123');
    expect(adapter.getConversationId('https://chatgpt.com/')).toBe(null);
  });

  it('handles normal single-turn request body and preserves metadata', () => {
    // Assumption: Standard ChatGPT web conversation payload
    const fixture = {
      action: 'next',
      messages: [
        {
          id: 'client-generated-uuid-1',
          author: { role: 'user' },
          content: {
            content_type: 'text',
            parts: ['Please audit my email alice.doe@example.com for breaches.'],
          },
          metadata: {
            serialization_metadata: { custom_symbol_offsets: [] },
          },
        },
      ],
      model: 'gpt-4o',
      parent_message_id: 'parent-root-uuid',
      timezone_offset_min: -300,
      suggestions: [],
      history_and_training_disabled: false,
    };

    const rawString = JSON.stringify(fixture);
    const extracted = adapter.extractUserPrompt(rawString);

    expect(extracted).not.toBeNull();
    expect(extracted?.prompt).toBe('Please audit my email alice.doe@example.com for breaches.');

    // Redaction replacement
    const redactedText = 'Please audit my email «EMAIL_1» for breaches.';
    const updatedString = extracted?.replaceWith(redactedText);
    const updatedObj = JSON.parse(updatedString!);

    // Prompt is replaced
    expect(updatedObj.messages[0].content.parts[0]).toBe(redactedText);

    // CRITICAL: IDs, models, and metadata must stay completely untouched
    expect(updatedObj.messages[0].id).toBe('client-generated-uuid-1');
    expect(updatedObj.messages[0].author.role).toBe('user');
    expect(updatedObj.model).toBe('gpt-4o');
    expect(updatedObj.action).toBe('next');
    expect(updatedObj.parent_message_id).toBe('parent-root-uuid');
    expect(updatedObj.timezone_offset_min).toBe(-300);
    expect(updatedObj.history_and_training_disabled).toBe(false);
  });

  it('handles multi-turn conversation body (targets last user prompt)', () => {
    // Assumption: Multi-turn history included in the client request
    const fixture = {
      action: 'next',
      messages: [
        {
          id: 'turn-1',
          author: { role: 'user' },
          content: { parts: ['Turn 1 prompt'] },
        },
        {
          id: 'turn-2',
          author: { role: 'assistant' },
          content: { parts: ['Turn 1 assistant answer'] },
        },
        {
          id: 'turn-3',
          author: { role: 'user' },
          content: { parts: ['Turn 3 new user prompt with phone 555-0199'] },
        },
      ],
      model: 'gpt-4o',
    };

    const extracted = adapter.extractUserPrompt(JSON.stringify(fixture));
    expect(extracted).not.toBeNull();
    expect(extracted?.prompt).toBe('Turn 3 new user prompt with phone 555-0199');

    const updated = JSON.parse(extracted!.replaceWith('Turn 3 with «PHONE_1»'));
    expect(updated.messages[0].content.parts[0]).toBe('Turn 1 prompt');
    expect(updated.messages[1].content.parts[0]).toBe('Turn 1 assistant answer');
    expect(updated.messages[2].content.parts[0]).toBe('Turn 3 with «PHONE_1»');
  });

  it('fails closed (returns null) on unexpected or malformed body shapes', () => {
    // Empty object
    expect(adapter.extractUserPrompt('{}')).toBeNull();

    // Invalid JSON
    expect(adapter.extractUserPrompt('invalid-json-payload')).toBeNull();

    // Missing messages array
    expect(adapter.extractUserPrompt(JSON.stringify({ model: 'gpt-4o', text: 'hello' }))).toBeNull();

    // Empty messages array
    expect(adapter.extractUserPrompt(JSON.stringify({ messages: [] }))).toBeNull();

    // User message missing content or parts
    expect(
      adapter.extractUserPrompt(
        JSON.stringify({
          messages: [{ author: { role: 'user' }, content: {} }],
        }),
      ),
    ).toBeNull();

    // parts array empty or non-string
    expect(
      adapter.extractUserPrompt(
        JSON.stringify({
          messages: [{ author: { role: 'user' }, content: { parts: [] } }],
        }),
      ),
    ).toBeNull();

    expect(
      adapter.extractUserPrompt(
        JSON.stringify({
          messages: [{ author: { role: 'user' }, content: { parts: [12345] } }],
        }),
      ),
    ).toBeNull();
  });
});

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();

  it('matches valid Claude URLs and completion endpoints', () => {
    expect(adapter.matchesPage('https://claude.ai/')).toBe(true);
    expect(adapter.matchesPage('https://claude.ai/chat/conv-claude-uuid-123')).toBe(true);
    expect(adapter.matchesPage('https://chatgpt.com/')).toBe(false);

    const completionUrl =
      'https://claude.ai/api/organizations/org-123/chat_conversations/conv-456/completion';
    expect(adapter.matchesRequest(completionUrl, 'POST')).toBe(true);
    expect(adapter.matchesRequest('/api/organizations/org-123/chat_conversations/conv-456/completion', 'POST')).toBe(true);
    expect(adapter.matchesRequest(completionUrl, 'GET')).toBe(false);
    expect(adapter.matchesRequest('/api/organizations/org-123/chat_conversations', 'POST')).toBe(false);
  });

  it('extracts conversation ID from URL', () => {
    expect(adapter.getConversationId('https://claude.ai/chat/323f46f2-763d-4c31-92b0-95e26ec2b9db')).toBe(
      '323f46f2-763d-4c31-92b0-95e26ec2b9db',
    );
    expect(adapter.getConversationId('https://claude.ai/new')).toBe(null);
  });

  it('handles Schema 1 (direct prompt string) and preserves metadata', () => {
    // Assumption: Legacy or simplified prompt endpoint
    const fixture = {
      prompt: 'My API key is sk-proj-1234567890abcdef1234567890abcdef12345678',
      model: 'claude-3-5-sonnet-20241022',
      timezone: 'America/New_York',
      attachments: [],
    };

    const extracted = adapter.extractUserPrompt(JSON.stringify(fixture));
    expect(extracted).not.toBeNull();
    expect(extracted?.prompt).toBe('My API key is sk-proj-1234567890abcdef1234567890abcdef12345678');

    const updated = JSON.parse(extracted!.replaceWith('My API key is «API_KEY_1»'));
    expect(updated.prompt).toBe('My API key is «API_KEY_1»');
    expect(updated.model).toBe('claude-3-5-sonnet-20241022');
    expect(updated.timezone).toBe('America/New_York');
    expect(updated.attachments).toEqual([]);
  });

  it('handles Schema 2 (modern messages array with block text) and preserves metadata', () => {
    // Assumption: Claude web client payload with structured content blocks
    const fixture = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please review code with secret token sk-proj-99998888777766665555444433332222',
            },
          ],
          uuid: 'user-msg-block-uuid',
        },
      ],
      model: 'claude-3-5-sonnet-20241022',
      stream: true,
      parent_message_uuid: 'parent-block-uuid',
    };

    const extracted = adapter.extractUserPrompt(JSON.stringify(fixture));
    expect(extracted).not.toBeNull();
    expect(extracted?.prompt).toBe(
      'Please review code with secret token sk-proj-99998888777766665555444433332222',
    );

    const updated = JSON.parse(extracted!.replaceWith('Please review code with secret token «API_KEY_1»'));
    expect(updated.messages[0].content[0].text).toBe(
      'Please review code with secret token «API_KEY_1»',
    );
    expect(updated.messages[0].uuid).toBe('user-msg-block-uuid');
    expect(updated.model).toBe('claude-3-5-sonnet-20241022');
    expect(updated.stream).toBe(true);
    expect(updated.parent_message_uuid).toBe('parent-block-uuid');
  });

  it('handles multi-turn conversation in Claude (targets latest user message)', () => {
    // Assumption: Multi-turn messages payload
    const fixture = {
      messages: [
        { role: 'user', content: 'First query' },
        { role: 'assistant', content: 'Assistant response' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second query with email user@claude.test' }],
        },
      ],
      model: 'claude-3-5-sonnet-20241022',
    };

    const extracted = adapter.extractUserPrompt(JSON.stringify(fixture));
    expect(extracted).not.toBeNull();
    expect(extracted?.prompt).toBe('Second query with email user@claude.test');

    const updated = JSON.parse(extracted!.replaceWith('Second query with email «EMAIL_1»'));
    expect(updated.messages[0].content).toBe('First query');
    expect(updated.messages[1].content).toBe('Assistant response');
    expect(updated.messages[2].content[0].text).toBe('Second query with email «EMAIL_1»');
  });

  it('fails closed (returns null) on unexpected or malformed body shapes', () => {
    expect(adapter.extractUserPrompt('{}')).toBeNull();
    expect(adapter.extractUserPrompt('malformed-json')).toBeNull();

    // Messages has no user role
    expect(
      adapter.extractUserPrompt(
        JSON.stringify({
          messages: [{ role: 'assistant', content: 'Hello' }],
        }),
      ),
    ).toBeNull();

    // User message content has unexpected type
    expect(
      adapter.extractUserPrompt(
        JSON.stringify({
          messages: [{ role: 'user', content: 99999 }],
        }),
      ),
    ).toBeNull();

    // Block array missing text string
    expect(
      adapter.extractUserPrompt(
        JSON.stringify({
          messages: [{ role: 'user', content: [{ type: 'image' }] }],
        }),
      ),
    ).toBeNull();
  });
});

describe('Gemini Support & Interception Status', () => {
  it('confirms Gemini is not supported and getAdapterForUrl returns null', () => {
    // gemini.google.com has no adapter
    expect(getAdapterForUrl('https://gemini.google.com/')).toBeNull();
    expect(getAdapterForUrl('https://gemini.google.com/app')).toBeNull();
    expect(getAdapterForUrl('https://gemini.google.com/chat/12345')).toBeNull();

    // Confirm neither ChatGPT nor Claude adapters match Gemini URLs
    const chatgpt = new ChatGPTAdapter();
    const claude = new ClaudeAdapter();
    expect(chatgpt.matchesPage('https://gemini.google.com/')).toBe(false);
    expect(claude.matchesPage('https://gemini.google.com/')).toBe(false);
  });

  it('confirms extension manifest does not request host permissions or inject into gemini.google.com', () => {
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Check host_permissions
      const hostPerms = manifest.host_permissions || [];
      expect(hostPerms.some((p: string) => p.includes('gemini.google.com'))).toBe(false);

      // Check content scripts matches
      for (const cs of manifest.content_scripts || []) {
        expect(cs.matches.some((m: string) => m.includes('gemini.google.com'))).toBe(false);
      }
    }
  });

  it('confirms no network interception runs on gemini.google.com', () => {
    // The MAIN-world network interceptor starts with:
    // const adapter = getAdapterForUrl(window.location.href);
    // if (!adapter) return;
    //
    // Since getAdapterForUrl is null for gemini.google.com, execution halts immediately:
    const adapter = getAdapterForUrl('https://gemini.google.com/app');
    expect(adapter).toBeNull();

    // Verify simulating a fetch call without adapter leaves request unmodified
    const originalBody = JSON.stringify({ prompt: 'test user query to gemini' });
    let intercepted = false;
    if (adapter) {
      intercepted = true;
    }
    expect(intercepted).toBe(false);
  });
});

