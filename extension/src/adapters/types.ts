/**
 * Ratchet Privacy Shield — Site Adapter Interfaces
 */

export interface ExtractedPrompt {
  /** The extracted user prompt string to be redacted */
  prompt: string;
  /** Function to produce a new JSON string with the prompt replaced, preserving all other fields */
  replaceWith: (redactedPrompt: string) => string;
}

export interface SiteAdapter {
  siteName: string;

  /** Whether this adapter applies to the current page hostname / URL */
  matchesPage(url: string): boolean;

  /** Whether this HTTP request targets the site's chat / conversation submission API */
  matchesRequest(url: string, method?: string): boolean;

  /** Extract conversation ID from page URL. Returns null for new/unassigned chats. */
  getConversationId(pageUrl: string): string | null;

  /**
   * Extract user message text fields from the request body string.
   * Returns null if the body shape does not match what the adapter expects (fail-closed).
   */
  extractUserPrompt(bodyString: string): ExtractedPrompt | null;

  /** Selectors for assistant response containers where restoration should be observed */
  getMessageSelectors(): string[];
}
