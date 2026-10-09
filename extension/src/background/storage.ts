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

/**
 * Retrieve the mapping for a conversation from chrome.storage.session.
 */
export async function getConversationMapping(
  conversationId: string,
): Promise<ConversationMapping | null> {
  if (!chrome?.storage?.session) return null;

  const key = `${STORAGE_KEY_CONV_PREFIX}${conversationId}`;
  return new Promise((resolve) => {
    chrome.storage.session.get([key], (result) => {
      const mapping = result[key] as ConversationMapping | undefined;
      resolve(mapping || null);
    });
  });
}

/**
 * Save or update a conversation mapping in chrome.storage.session.
 */
export async function saveConversationMapping(
  mapping: ConversationMapping,
): Promise<void> {
  if (!chrome?.storage?.session) return;

  const key = `${STORAGE_KEY_CONV_PREFIX}${mapping.conversationId}`;
  return new Promise((resolve) => {
    chrome.storage.session.set({ [key]: mapping }, () => {
      resolve();
    });
  });
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
