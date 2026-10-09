/**
 * Ratchet Privacy Shield — Site Adapter Registry
 */

import type { SiteAdapter } from './types';
import { ChatGPTAdapter } from './chatgpt';
import { ClaudeAdapter } from './claude';
import { MockSiteAdapter } from './mock';

export * from './types';
export * from './chatgpt';
export * from './claude';
export * from './mock';

const ADAPTERS: SiteAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
];

// MockSiteAdapter exists only in test builds, never in production dist/
if (typeof __TEST_BUILD__ !== 'undefined' && __TEST_BUILD__) {
  ADAPTERS.push(new MockSiteAdapter());
}

/**
 * Find the matching site adapter for a given URL (typically window.location.href).
 */
export function getAdapterForUrl(url: string): SiteAdapter | null {
  for (const adapter of ADAPTERS) {
    if (adapter.matchesPage(url)) {
      return adapter;
    }
  }
  return null;
}
