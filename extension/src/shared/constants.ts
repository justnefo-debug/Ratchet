/**
 * Ratchet Privacy Shield — Constants & Configuration
 */

import type { RatchetSettings, Sensitivity } from './types';

// ─── Placeholder Format ──────────────────────────────────────────
// Using guillemets (« ») instead of brackets to survive markdown rendering.

export const PLACEHOLDER_START = '«';
export const PLACEHOLDER_END = '»';

/** Matches a complete placeholder like «PERSON_1» */
export const PLACEHOLDER_REGEX = /«([A-Z_]+_\d+)»/g;

/** Flexible version that tolerates spaces around the placeholder name. */
export const PLACEHOLDER_REGEX_FLEXIBLE = /«\s*([A-Z_]+_\d+)\s*»/g;

// ─── Message Source Identifiers ──────────────────────────────────

export const MSG_SOURCE_MAIN = 'RATCHET_MAIN' as const;
export const MSG_SOURCE_ISOLATED = 'RATCHET_ISOLATED' as const;

// ─── Sensitivity Thresholds ──────────────────────────────────────
// Minimum confidence to include an entity, indexed by sensitivity level.

export const SENSITIVITY_THRESHOLDS: Record<Sensitivity, number> = {
  low: 0.85,     // few false positives
  medium: 0.65,  // balanced
  high: 0.45,    // catch (almost) everything
};

// ─── Default Settings ────────────────────────────────────────────

export const DEFAULT_SETTINGS: RatchetSettings = {
  enabled: true,
  sensitivity: 'medium',
  customRules: [],
  enabledSites: {
    chatgpt: true,
    claude: true,
    gemini: true,
  },
  powerMode: false,
  backendUrl: 'http://127.0.0.1:5000',
};

// ─── Storage Keys ────────────────────────────────────────────────

export const STORAGE_KEY_SETTINGS = 'ratchet_settings';
export const STORAGE_KEY_CONV_PREFIX = 'conv:';
export const STORAGE_KEY_STATS = 'ratchet_stats';
