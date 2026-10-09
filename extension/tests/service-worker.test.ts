import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getConversationMapping,
  saveConversationMapping,
  getSettings,
  updateStats,
  getSessionStats,
  recordSessionRedaction,
  clearAllMappings,
} from '../src/background/storage';
import {
  isSiteEnabled,
  handleRedact,
} from '../src/background/service-worker';
import { redact } from '../src/core/redactor';
import { restore } from '../src/core/restorer';
import { detectWithRegex } from '../src/detectors/regex-detector';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../src/shared/constants';
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
          get: vi.fn((keys: string[] | string | null, cb: (res: any) => void) => {
            const res: Record<string, any> = {};
            if (!keys) {
              for (const [k, v] of sessionStorageMap.entries()) res[k] = v;
            } else {
              const arr = Array.isArray(keys) ? keys : [keys];
              for (const k of arr) {
                if (sessionStorageMap.has(k)) res[k] = sessionStorageMap.get(k);
              }
            }
            cb(res);
          }),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            for (const [k, v] of Object.entries(items)) {
              sessionStorageMap.set(k, v);
            }
            if (cb) cb();
          }),
          remove: vi.fn((keys: string | string[], cb?: () => void) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            for (const k of arr) sessionStorageMap.delete(k);
            if (cb) cb();
          }),
          clear: vi.fn((cb?: () => void) => {
            sessionStorageMap.clear();
            if (cb) cb();
          }),
        },
        local: {
          get: vi.fn((keys: string[] | string | null, cb: (res: any) => void) => {
            const res: Record<string, any> = {};
            if (!keys) {
              for (const [k, v] of localStorageMap.entries()) res[k] = v;
            } else {
              const arr = Array.isArray(keys) ? keys : [keys];
              for (const k of arr) {
                if (localStorageMap.has(k)) res[k] = localStorageMap.get(k);
              }
            }
            cb(res);
          }),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            for (const [k, v] of Object.entries(items)) {
              localStorageMap.set(k, v);
            }
            if (cb) cb();
          }),
          remove: vi.fn((keys: string | string[], cb?: () => void) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            for (const k of arr) localStorageMap.delete(k);
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

  it('records session stats broken down by category', async () => {
    const stats0 = await getSessionStats();
    expect(stats0.totalRedacted).toBe(0);

    await recordSessionRedaction([
      { type: 'EMAIL' },
      { type: 'EMAIL' },
      { type: 'PHONE' },
    ]);

    const stats1 = await getSessionStats();
    expect(stats1.totalRedacted).toBe(3);
    expect(stats1.byCategory.EMAIL).toBe(2);
    expect(stats1.byCategory.PHONE).toBe(1);
  });

  it('evaluates isSiteEnabled correctly for supported sites and custom origins', () => {
    const enabledSites = { chatgpt: true, claude: false, gemini: true, mock: true };
    expect(isSiteEnabled('https://chatgpt.com', enabledSites)).toBe(true);
    expect(isSiteEnabled('https://chat.openai.com', enabledSites)).toBe(true);
    expect(isSiteEnabled('https://claude.ai', enabledSites)).toBe(false);
    expect(isSiteEnabled('https://gemini.google.com', enabledSites)).toBe(true);
    expect(isSiteEnabled('http://localhost:3000', enabledSites)).toBe(true);
    expect(isSiteEnabled('http://127.0.0.1:8080', enabledSites)).toBe(true);
  });

  it('respects per-site toggle and passes text through unchanged when site is disabled', async () => {
    // Disable chatgpt in settings
    localStorageMap.set(STORAGE_KEY_SETTINGS, {
      ...DEFAULT_SETTINGS,
      enabledSites: { chatgpt: false, claude: true, gemini: true, mock: true },
    });

    const resDisabled = await handleRedact({
      text: 'Send secret to alice@example.com',
      conversationId: 'c-test-disabled',
      siteOrigin: 'https://chatgpt.com',
    });

    // When site is disabled, redactedText must equal original text unmodified
    expect(resDisabled.redactedText).toBe('Send secret to alice@example.com');
    expect(resDisabled.mappings.length).toBe(0);

    // But for enabled site (claude), redaction must proceed
    const resEnabled = await handleRedact({
      text: 'Send secret to alice@example.com',
      conversationId: 'c-test-enabled',
      siteOrigin: 'https://claude.ai',
    });

    expect(resEnabled.redactedText).toBe('Send secret to «EMAIL_1»');
    expect(resEnabled.mappings.length).toBe(1);
  });

  it('respects per-entity toggles and ignores disabled entity types', async () => {
    // Disable EMAIL redaction, keep PHONE enabled
    localStorageMap.set(STORAGE_KEY_SETTINGS, {
      ...DEFAULT_SETTINGS,
      entityToggles: { EMAIL: false, PHONE: true },
    });

    const res = await handleRedact({
      text: 'Contact user@example.com or +1 (555) 234-5678.',
      conversationId: 'c-test-entity-toggles',
      siteOrigin: 'https://chatgpt.com',
    });

    // EMAIL should NOT be redacted, PHONE should be redacted
    expect(res.redactedText).toContain('user@example.com');
    expect(res.redactedText).toContain('«PHONE_1»');
    expect(res.mappings.some((m) => m.type === 'EMAIL')).toBe(false);
    expect(res.mappings.some((m) => m.type === 'PHONE')).toBe(true);
  });

  it('clears all mappings across session and local storage on clearAllMappings', async () => {
    sessionStorageMap.set('conv:c1', { conversationId: 'c1', entries: [] });
    sessionStorageMap.set('conv:c2', { conversationId: 'c2', entries: [] });
    sessionStorageMap.set('other_key', 'val');
    localStorageMap.set('enc:conv:c1', 'encrypted');

    await clearAllMappings();

    expect(sessionStorageMap.has('conv:c1')).toBe(false);
    expect(sessionStorageMap.has('conv:c2')).toBe(false);
    expect(sessionStorageMap.has('other_key')).toBe(true);
    expect(localStorageMap.has('enc:conv:c1')).toBe(false);
  });
});

