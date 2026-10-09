/**
 * Ratchet Privacy Shield — Service Worker
 *
 * Coordinates detection, redaction, and restoration using TypeScript-native modules.
 * Manages per-conversation mappings in chrome.storage.session without in-memory state.
 */

import { detectWithRegex } from '../detectors/regex-detector';
import { detectWithCustomRules } from '../detectors/custom-rules';
import { detectWithNer } from '../detectors/ner-detector';
import { redact, deduplicateOverlaps } from '../core/redactor';
import { restore } from '../core/restorer';
import {
  getConversationMapping,
  saveConversationMapping,
  migrateConversationMapping,
  getSettings,
  updateStats,
  clearAllMappings,
  getSessionStats,
  recordSessionRedaction,
} from './storage';
import { SENSITIVITY_THRESHOLDS } from '../shared/constants';
import type { DetectedEntity } from '../shared/types';

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('🛡️ Ratchet Privacy Shield installed');
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'redact') {
    handleRedact(request)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'restore') {
    handleRestore(request)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  }

  if (request.action === 'getMapping') {
    handleGetMapping(request)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  }

  if (request.action === 'migrateMapping') {
    migrateConversationMapping(request.fromId, request.toId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  }

  if (request.action === 'getSettings') {
    getSettings()
      .then((settings) => sendResponse({ success: true, data: settings }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  }

  if (request.action === 'getSessionStats') {
    getSessionStats()
      .then((stats) => sendResponse({ success: true, data: stats }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  }

  if (request.action === 'clearAllMappings') {
    clearAllMappings()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  }
  });
}

export function isSiteEnabled(siteOrigin: string, enabledSites: Record<string, boolean>): boolean {
  if (!siteOrigin) return true;
  const lower = siteOrigin.toLowerCase();
  if (lower.includes('chatgpt.com') || lower.includes('chat.openai.com')) {
    return enabledSites.chatgpt !== false;
  }
  if (lower.includes('claude.ai')) {
    return enabledSites.claude !== false;
  }
  if (lower.includes('gemini.google.com')) {
    return enabledSites.gemini !== false;
  }
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
    return enabledSites.mock !== false;
  }
  return true;
}

/**
 * Handle redaction request.
 */
export async function handleRedact(request: {
  text?: string;
  conversationId?: string;
  siteOrigin?: string;
}) {
  const text = request.text || '';
  const conversationId = request.conversationId || 'default';
  const siteOrigin = request.siteOrigin || '';

  const settings = await getSettings();

  // Check global toggle, per-site toggle, and non-empty text
  if (!settings.enabled || !isSiteEnabled(siteOrigin, settings.enabledSites || {}) || !text) {
    return {
      redactedText: text,
      mappings: [],
      entities: [],
      entityCounts: {},
      conversationId,
      skippedRules: [],
      warnings: [],
    };
  }

  // 1. Retrieve existing mappings for this conversation to maintain consistent placeholders
  const convMap = await getConversationMapping(conversationId);
  const existingMappings = convMap?.entries || [];

  // 2. Run detection pipeline
  const regexEntities = detectWithRegex(text);
  const customResult = detectWithCustomRules(text, settings.customRules || []);
  const customEntities = customResult.entities;
  const nerEntities = await detectWithNer(text);

  const allEntities: DetectedEntity[] = [
    ...regexEntities,
    ...customEntities,
    ...nerEntities,
  ];

  // Optional Power Mode (disabled by default)
  if (settings.powerMode && settings.backendUrl) {
    try {
      const resp = await fetch(`${settings.backendUrl}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.entities)) {
          for (const e of data.entities) {
            allEntities.push({
              type: e.type,
              value: e.value,
              start: e.start,
              end: e.end,
              confidence: e.confidence || 0.9,
              source: 'ner',
            });
          }
        }
      }
    } catch {
      // Graceful fallback if optional backend is offline
    }
  }

  // 3. Filter by per-entity toggles
  const entityToggles = settings.entityToggles || {};
  const activeEntities = allEntities.filter(
    (e) => entityToggles[e.type] !== false,
  );

  // 4. Filter by sensitivity confidence threshold
  const minConfidence = SENSITIVITY_THRESHOLDS[settings.sensitivity] ?? 0.65;
  const filteredEntities = activeEntities.filter((e) => e.confidence >= minConfidence);

  // 5. Resolve overlapping intervals
  const cleanEntities = deduplicateOverlaps(filteredEntities);

  // 6. Redact text and assign placeholders
  const { redactedText, mappings } = redact(text, cleanEntities, existingMappings);

  // 7. Save updated mappings in session storage (and optional persistent storage)
  await saveConversationMapping({
    conversationId,
    siteOrigin: request.siteOrigin || convMap?.siteOrigin || '',
    entries: mappings,
    createdAt: convMap?.createdAt || Date.now(),
    lastUsedAt: Date.now(),
  });

  // 8. Calculate entity counts by type
  const entityCounts: Record<string, number> = {};
  for (const ent of cleanEntities) {
    entityCounts[ent.type] = (entityCounts[ent.type] || 0) + 1;
  }

  // 9. Update telemetry and session stats by category
  await updateStats(cleanEntities.length, cleanEntities.length);
  await recordSessionRedaction(cleanEntities);

  return {
    redactedText,
    mappings,
    entities: cleanEntities,
    entityCounts,
    conversationId,
    skippedRules: customResult.skippedRules,
    warnings: customResult.warnings,
  };
}

/**
 * Handle restoration request.
 */
export async function handleRestore(request: {
  text?: string;
  conversationId?: string;
}) {
  const text = request.text || '';
  const conversationId = request.conversationId || 'default';

  if (!text) {
    return { restoredText: '', restoredCount: 0, conversationId };
  }

  const convMap = await getConversationMapping(conversationId);
  const mappings = convMap?.entries || [];

  const restoredText = restore(text, mappings);

  let restoredCount = 0;
  for (const entry of mappings) {
    if (text.includes(entry.placeholder) || text.includes(entry.placeholder.slice(1, -1))) {
      restoredCount++;
    }
  }

  return {
    restoredText,
    restoredCount,
    conversationId,
  };
}

/**
 * Retrieve current mapping entries for a conversation.
 */
async function handleGetMapping(request: { conversationId?: string }) {
  const conversationId = request.conversationId || 'default';
  const convMap = await getConversationMapping(conversationId);
  return {
    conversationId,
    mappings: convMap?.entries || [],
  };
}
