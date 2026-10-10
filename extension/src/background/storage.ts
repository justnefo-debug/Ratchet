/**
 * Ratchet Privacy Shield — Service Worker Storage Manager
 *
 * Persists per-conversation mappings in chrome.storage.session
 * and global settings in chrome.storage.local.
 * Zero in-memory state so service worker restart does not lose data.
 */

import type { ConversationMapping, RatchetSettings } from '../shared/types';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY_CONV_PREFIX,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_STATS,
} from '../shared/constants';
import {
  savePersistentMapping,
  getPersistentMapping,
  clearAllPersistentMappings,
} from './crypto-storage';

/**
 * Retrieve the mapping for a conversation from chrome.storage.session
 * or optional AES-GCM persistent storage if persistence is enabled.
 */
export async function getConversationMapping(
  conversationId: string,
): Promise<ConversationMapping | null> {
  // 1. Check fast in-memory session storage (default)
  if (chrome?.storage?.session) {
    const key = `${STORAGE_KEY_CONV_PREFIX}${conversationId}`;
    const sessionMapping = await new Promise<ConversationMapping | null>((resolve) => {
      chrome.storage.session.get([key], (result) => {
        resolve((result[key] as ConversationMapping) || null);
      });
    });

    if (sessionMapping) {
      return sessionMapping;
    }

    // Fallback: If no mapping is found for the current id, fall back to the most recent mapping
    // ONLY if the target ID is a real ID and the most recent mapping is a temp mapping.
    if (conversationId !== 'default' && !conversationId.startsWith('temp-')) {
      const allItems = await new Promise<any>((resolve) => chrome.storage.session.get(null, resolve));
      let mostRecent: ConversationMapping | null = null;
      let highestTime = 0;
      for (const k of Object.keys(allItems || {})) {
        if (k.startsWith(STORAGE_KEY_CONV_PREFIX)) {
          const m = allItems[k] as ConversationMapping;
          // Only fallback from a temp mapping
          if (m && m.conversationId.startsWith('temp-') && m.lastUsedAt > highestTime) {
            highestTime = m.lastUsedAt;
            mostRecent = m;
          }
        }
      }
      
      if (mostRecent) {
        // Migrate it to the current conversation ID
        await migrateConversationMapping(mostRecent.conversationId, conversationId);
        mostRecent.conversationId = conversationId;
        return mostRecent;
      }
    }
  }

  // 2. If not found in session, check optional persistent storage (off by default)
  const settings = await getSettings();
  if (settings.enablePersistence) {
    const persistentMapping = await getPersistentMapping(conversationId);
    if (persistentMapping) {
      // Re-populate session storage for fast access
      if (chrome?.storage?.session) {
        const key = `${STORAGE_KEY_CONV_PREFIX}${conversationId}`;
        chrome.storage.session.set({ [key]: persistentMapping });
      }
      return persistentMapping;
    }
  }

  return null;
}

/**
 * Save or update a conversation mapping in chrome.storage.session,
 * and optionally in AES-GCM encrypted persistent storage if enabled.
 */
export async function saveConversationMapping(
  mapping: ConversationMapping,
): Promise<void> {
  // 1. Save in session storage (default)
  if (chrome?.storage?.session) {
    const key = `${STORAGE_KEY_CONV_PREFIX}${mapping.conversationId}`;
    await new Promise<void>((resolve) => {
      chrome.storage.session.set({ [key]: mapping }, () => resolve());
    });
  }

  // 2. Optionally encrypt and persist to local storage
  const settings = await getSettings();
  if (settings.enablePersistence) {
    const expiryHours = settings.persistenceExpiryHours || 24;
    await savePersistentMapping(mapping, expiryHours);
  }
}

/**
 * Clear all conversation mappings from both session storage and persistent storage.
 */
export async function clearAllMappings(): Promise<void> {
  // 1. Clear session storage mappings
  if (chrome?.storage?.session) {
    await new Promise<void>((resolve) => {
      chrome.storage.session.get(null, (items) => {
        const keys = Object.keys(items || {}).filter((k) =>
          k.startsWith(STORAGE_KEY_CONV_PREFIX),
        );
        if (keys.length > 0) {
          chrome.storage.session.remove(keys, () => resolve());
        } else {
          resolve();
        }
      });
    });
  }

  // 2. Clear encrypted persistent mappings
  await clearAllPersistentMappings();
}

/**
 * Migrate mapping from a temporary ID to a real conversation ID when URL updates.
 */
export async function migrateConversationMapping(
  fromId: string,
  toId: string,
): Promise<void> {
  if (!chrome?.storage?.session || fromId === toId) return;

  const fromKey = `${STORAGE_KEY_CONV_PREFIX}${fromId}`;
  const toKey = `${STORAGE_KEY_CONV_PREFIX}${toId}`;

  return new Promise((resolve) => {
    chrome.storage.session.get([fromKey, toKey], (res) => {
      const fromMapping = res[fromKey] as ConversationMapping | undefined;
      const toMapping = res[toKey] as ConversationMapping | undefined;

      if (!fromMapping) {
        resolve();
        return;
      }

      const mergedEntries = [...(toMapping?.entries || [])];
      for (const entry of fromMapping.entries) {
        if (!mergedEntries.some((e) => e.placeholder === entry.placeholder)) {
          mergedEntries.push(entry);
        }
      }

      const updatedTo: ConversationMapping = {
        conversationId: toId,
        siteOrigin: toMapping?.siteOrigin || fromMapping.siteOrigin,
        entries: mergedEntries,
        createdAt: toMapping?.createdAt || fromMapping.createdAt,
        lastUsedAt: Date.now(),
      };

      chrome.storage.session.set({ [toKey]: updatedTo }, () => {
        chrome.storage.session.remove([fromKey], () => resolve());
      });
    });
  });
}

/**
 * Get current extension settings from chrome.storage.local.
 */
export async function getSettings(): Promise<RatchetSettings> {
  if (!chrome?.storage?.local) return DEFAULT_SETTINGS;

  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_SETTINGS], (result) => {
      const stored = result[STORAGE_KEY_SETTINGS] as Partial<RatchetSettings> | undefined;
      resolve({ ...DEFAULT_SETTINGS, ...(stored || {}) });
    });
  });
}

/**
 * Update total items detected and redacted statistics in chrome.storage.local.
 */
export async function updateStats(
  detectedCount: number,
  redactedCount: number,
): Promise<void> {
  if (!chrome?.storage?.local) return;

  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_STATS], (result) => {
      const current = (result[STORAGE_KEY_STATS] as { detected: number; redacted: number }) || {
        detected: 0,
        redacted: 0,
      };
      const updated = {
        detected: current.detected + detectedCount,
        redacted: current.redacted + redactedCount,
      };
      chrome.storage.local.set({ [STORAGE_KEY_STATS]: updated }, () => {
        resolve();
      });
    });
  });
}

export interface SessionStats {
  totalDetected: number;
  totalRedacted: number;
  byCategory: Record<string, number>;
}

export const STORAGE_KEY_SESSION_STATS = 'session_stats';

/**
 * Retrieve current session statistics from chrome.storage.session.
 */
export async function getSessionStats(): Promise<SessionStats> {
  const defaultStats: SessionStats = {
    totalDetected: 0,
    totalRedacted: 0,
    byCategory: {},
  };

  if (!chrome?.storage?.session) return defaultStats;

  return new Promise((resolve) => {
    chrome.storage.session.get([STORAGE_KEY_SESSION_STATS], (result) => {
      resolve(result[STORAGE_KEY_SESSION_STATS] || defaultStats);
    });
  });
}

/**
 * Update real-time session stats categorized by entity type.
 */
export async function recordSessionRedaction(
  entities: { type: string }[],
): Promise<SessionStats> {
  const current = await getSessionStats();
  current.totalDetected += entities.length;
  current.totalRedacted += entities.length;

  for (const ent of entities) {
    current.byCategory[ent.type] = (current.byCategory[ent.type] || 0) + 1;
  }

  if (chrome?.storage?.session) {
    await new Promise<void>((resolve) => {
      chrome.storage.session.set({ [STORAGE_KEY_SESSION_STATS]: current }, () => resolve());
    });
  }

  return current;
}
