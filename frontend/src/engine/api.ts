import type { DetectedEntity, SessionRecord, CustomRule, EntityType } from '../types';
import { detectEntitiesInText, buildRedactedText } from './detector';
import { restoreTextFromSession, type RestorationResult } from './restorer';

const API_BASE_URL = 'http://localhost:5000/api';

export interface HealthCheckResponse {
  status: string;
  version: string;
  backend: boolean;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Redact text via backend if reachable, otherwise run local in-browser engine
 */
export async function performRedaction(
  text: string,
  customRules: CustomRule[] = [],
  enabledTypes?: Record<EntityType, boolean>
): Promise<{
  safeText: string;
  entities: DetectedEntity[];
  isLocal: boolean;
  sessionId: string;
}> {
  const sessionId = `session-${Date.now()}`;

  // Try backend first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`${API_BASE_URL}/redact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sessionId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        safeText: data.redacted_text || data.safeText,
        entities: data.entities || [],
        isLocal: false,
        sessionId: data.session_id || sessionId,
      };
    }
  } catch {
    // Backend offline or timeout -> proceed with high-performance local engine
  }

  // Local fallback
  const entities = detectEntitiesInText(text, customRules, enabledTypes);
  const safeText = buildRedactedText(text, entities);

  return {
    safeText,
    entities,
    isLocal: true,
    sessionId,
  };
}

/**
 * Restore text via backend if reachable, otherwise run local in-browser engine
 */
export async function performRestoration(
  aiText: string,
  session: SessionRecord
): Promise<RestorationResult & { isLocal: boolean }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`${API_BASE_URL}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: aiText,
        session_id: session.id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        restoredText: data.restored_text || data.restoredText,
        parts: [{ text: data.restored_text, isRestored: true }],
        restoredCount: data.restored_count || 0,
        unmatchedPlaceholders: [],
        isLocal: false,
      };
    }
  } catch {
    // Backend offline -> run local
  }

  const result = restoreTextFromSession(aiText, session);
  return {
    ...result,
    isLocal: true,
  };
}
