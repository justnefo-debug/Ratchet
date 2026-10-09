import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getConversationMapping,
  saveConversationMapping,
  getSettings,
  updateStats,
} from '../src/background/storage';
import { redact } from '../src/core/redactor';
import { restore } from '../src/core/restorer';
import { detectWithRegex } from '../src/detectors/regex-detector';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import type { ConversationMapping } from '../src/shared/types';

describe('Service Worker & Session Storage Mapping Pipeline', () => {
  const sessionStorageMap = new Map<string, any>();
  const localStorageMap = new Map<string, any>();

  beforeEach(() => {
    sessionStorageMap.clear();
    localStorageMap.clear();

    // Mock chrome.storage
    (globalThis as any).chrome = {
      storage: {
        session: {
          get: vi.fn((keys: string[], cb: (res: any) => void) => {
            const res: Record<string, any> = {};
            for (const k of keys) {
              if (sessionStorageMap.has(k)) res[k] = sessionStorageMap.get(k);
            }
            cb(res);
          }),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            for (const [k, v] of Object.entries(items)) {
              sessionStorageMap.set(k, v);
            }
            if (cb) cb();
          }),
        },
        local: {
          get: vi.fn((keys: string[], cb: (res: any) => void) => {
            const res: Record<string, any> = {};
            for (const k of keys) {
              if (localStorageMap.has(k)) res[k] = localStorageMap.get(k);
            }
            cb(res);
          }),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            for (const [k, v] of Object.entries(items)) {
              localStorageMap.set(k, v);
            }
            if (cb) cb();
          }),
        },
      },
    };
  });

  it('persists conversation mappings to session storage and retrieves them cleanly', async () => {
    const convId = 'chat-12345';
    const testMapping: ConversationMapping = {
      conversationId: convId,
      siteOrigin: 'https://chatgpt.com',
      entries: [
        { placeholder: '«EMAIL_1»', original: 'user@example.com', type: 'EMAIL' },
      ],
      createdAt: 1000,
      lastUsedAt: 1000,
    };

    await saveConversationMapping(testMapping);

    // Verify written to storage session under conv:chat-12345
    expect(sessionStorageMap.has('conv:chat-12345')).toBe(true);

    const loaded = await getConversationMapping(convId);
    expect(loaded).not.toBeNull();
    expect(loaded?.conversationId).toBe(convId);
    expect(loaded?.entries.length).toBe(1);
    expect(loaded?.entries[0].original).toBe('user@example.com');
  });

  it('maintains consistent placeholder numbering across separate messages using session storage', async () => {
    const convId = 'conv-session-test';

    // Turn 1: user mentions user1@example.com
    const text1 = 'Notify user1@example.com about the release.';
    const ent1 = detectWithRegex(text1);
    const existing1 = (await getConversationMapping(convId))?.entries || [];
    const res1 = redact(text1, ent1, existing1);

    await saveConversationMapping({
      conversationId: convId,
      siteOrigin: 'https://claude.ai',
      entries: res1.mappings,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    expect(res1.redactedText).toBe('Notify «EMAIL_1» about the release.');

    // Turn 2: in the same conversation, user mentions user1@example.com again and user2@example.com
    const text2 = 'Please also send an email to user1@example.com and user2@example.com.';
    const ent2 = detectWithRegex(text2);
    // Reload mappings exclusively from chrome.storage.session (simulates SW waking up after idle termination)
    const existing2 = (await getConversationMapping(convId))?.entries || [];
    const res2 = redact(text2, ent2, existing2);

    await saveConversationMapping({
      conversationId: convId,
      siteOrigin: 'https://claude.ai',
      entries: res2.mappings,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    // user1@example.com MUST remain «EMAIL_1», user2@example.com gets «EMAIL_2»
    expect(res2.redactedText).toBe('Please also send an email to «EMAIL_1» and «EMAIL_2».');

    // Turn 3: AI responds with placeholders
    const aiResponse = 'I have scheduled notifications for «EMAIL_1» and «EMAIL_2».';
    const finalStored = (await getConversationMapping(convId))?.entries || [];
    const restoredAiResponse = restore(aiResponse, finalStored);

    expect(restoredAiResponse).toBe('I have scheduled notifications for user1@example.com and user2@example.com.');
  });

  it('updates telemetry stats in local storage without affecting session mappings', async () => {
    await updateStats(3, 3);
    await updateStats(2, 2);

    expect(localStorageMap.get('ratchet_stats')).toEqual({
      detected: 5,
      redacted: 5,
    });
  });

  it('falls back cleanly to default settings when none stored', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.powerMode).toBe(false);
    expect(settings.enabled).toBe(true);
  });
});
