/**
 * Ratchet Privacy Shield — Dedicated ReDoS Validation Worker
 *
 * Runs regular expression safety checks off the main UI thread.
 * If a regex enters catastrophic backtracking, the Worker thread
 * can be terminated by the caller without stalling the UI.
 */

import { validateRegexSafety } from './redos-validator';

self.onmessage = (e: MessageEvent) => {
  const { pattern } = e.data;
  const result = validateRegexSafety(pattern);
  self.postMessage(result);
};
