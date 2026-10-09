/**
 * Ratchet Privacy Shield — ISOLATED-World DOM Response Restorer
 *
 * Scoped MutationObserver targeting only assistant message containers.
 * Never observes or touches user input fields or editable elements.
 * Handles placeholders split across text nodes, streaming updates,
 * inline code, and code blocks.
 * Only restores placeholders that exist in the active conversation mapping.
 * Prevents mutation loops while handling framework re-renders.
 */

import { getAdapterForUrl } from '../adapters';
import { restore } from '../core/restorer';
import type { MappingEntry } from '../shared/types';

export class ContentRestorer {
  private adapter = getAdapterForUrl(window.location.href);
  private cachedMappings: MappingEntry[] = [];
  private observedContainers = new WeakSet<Element>();
  private isRestoring = false;
  private currentConvId: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    if (!this.adapter) return;

    this.updateMappings();

    // 1. Find existing assistant message containers and observe them
    this.attachObserversToExisting();

    // 2. Observe document for new assistant containers being added
    const rootObserver = new MutationObserver((mutations) => {
      if (this.isRestoring) return;
      for (const mut of mutations) {
        for (const added of Array.from(mut.addedNodes)) {
          if (added instanceof HTMLElement) {
            this.checkAndObserveContainer(added);
          }
        }
      }
    });

    rootObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Refresh mappings periodically, on window focus, or when new redactions occur
    window.addEventListener('focus', () => this.updateMappings());
    window.addEventListener('ratchet:mapping-updated', () => this.updateMappings());
  }

  private isUpdatingMappings = false;

  public getCurrentConversationId(): string | null {
    return this.currentConvId;
  }

  /**
   * Fetch current conversation mappings from the service worker.
   */
  public updateMappings(): void {
    if (!this.adapter || this.isUpdatingMappings) return;
    const convId = this.adapter.getConversationId(window.location.href) || 'default';
    this.currentConvId = convId;
    this.isUpdatingMappings = true;

    try {
      chrome.runtime.sendMessage({ action: 'getMapping', conversationId: convId }, (res) => {
        this.isUpdatingMappings = false;
        if (res && res.success && Array.isArray(res.data?.mappings)) {
          this.cachedMappings = res.data.mappings;
          // Trigger scan on existing containers with fresh mappings
          this.scanAllContainers();
        }
      });
    } catch {
      this.isUpdatingMappings = false;
      // Background worker might be idle
    }
  }

  private attachObserversToExisting(): void {
    if (!this.adapter) return;
    const selectors = this.adapter.getMessageSelectors();
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => this.observeContainer(el));
    }
  }

  private checkAndObserveContainer(element: HTMLElement): void {
    if (this.isEditable(element)) return;

    if (!this.adapter) return;
    const selectors = this.adapter.getMessageSelectors();
    for (const sel of selectors) {
      if (element.matches(sel)) {
        this.observeContainer(element);
        return;
      }
      const children = element.querySelectorAll(sel);
      children.forEach((child) => this.observeContainer(child));
    }
  }

  private observeContainer(container: Element): void {
    if (this.observedContainers.has(container) || this.isEditable(container)) {
      return;
    }

    this.observedContainers.add(container);

    const observer = new MutationObserver((mutations) => {
      if (this.isRestoring) return;
      this.handleContainerMutations(container, mutations);
    });

    observer.observe(container, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    // Initial pass on existing contents
    this.restoreContainerText(container);
  }

  private isEditable(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return true;
    if (element.getAttribute('contenteditable') === 'true') return true;
    if ((element as HTMLElement).isContentEditable) return true;
    if (element.closest && element.closest('textarea, input, [contenteditable="true"]')) {
      return true;
    }
    return false;
  }

  private handleContainerMutations(container: Element, mutations: MutationRecord[]): void {
    if (this.cachedMappings.length === 0) {
      this.updateMappings();
      return;
    }

    let needsRestore = false;
    let mightHaveNewPlaceholder = false;

    for (const m of mutations) {
      if (m.type === 'characterData' && m.target.nodeValue) {
        if (this.hasAnyPlaceholder(m.target.nodeValue)) {
          needsRestore = true;
          break;
        } else if (m.target.nodeValue.includes('«') || /[A-Z0-9_]{3,}_\d+/.test(m.target.nodeValue)) {
          mightHaveNewPlaceholder = true;
        }
      } else if (m.type === 'childList') {
        needsRestore = true;
        break;
      }
    }

    if (needsRestore) {
      this.restoreContainerText(container);
    } else if (mightHaveNewPlaceholder) {
      this.updateMappings();
    }
  }

  private hasAnyPlaceholder(text: string): boolean {
    for (const m of this.cachedMappings) {
      if (text.includes(m.placeholder)) return true;
      // Also check bare placeholder
      const bare = m.placeholder.replace(/^«/, '').replace(/»$/, '');
      if (text.includes(bare)) return true;
    }
    return false;
  }

  private scanAllContainers(): void {
    if (!this.adapter || this.cachedMappings.length === 0) return;
    const selectors = this.adapter.getMessageSelectors();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        this.restoreContainerText(el);
      });
    }
  }

  /**
   * Restores text in `container` handling single text nodes, split nodes,
   * code blocks, and inline code elements.
   */
  private restoreContainerText(container: Element): void {
    if (this.cachedMappings.length === 0 || this.isEditable(container)) {
      return;
    }

    const fullText = container.textContent || '';
    if (!this.hasAnyPlaceholder(fullText)) {
      return;
    }

    this.isRestoring = true;

    try {
      // Find all leaf text-containing elements (paragraphs, code, spans, list items)
      const blocks = container.querySelectorAll('p, pre, code, span, li, blockquote, div');
      const targetElements = blocks.length > 0 ? Array.from(blocks) : [container];

      for (const el of targetElements) {
        if (this.isEditable(el)) continue;

        // Collect direct text child nodes
        const textNodes: Text[] = [];
        for (const child of Array.from(el.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE && child.nodeValue) {
            textNodes.push(child as Text);
          }
        }

        if (textNodes.length === 0) continue;

        if (textNodes.length === 1) {
          const node = textNodes[0];
          const orig = node.nodeValue || '';
          if (this.hasAnyPlaceholder(orig)) {
            const restored = restore(orig, this.cachedMappings);
            if (restored !== orig) {
              node.nodeValue = restored;
            }
          }
        } else {
          // Multiple adjacent text nodes (handles split streaming tokens across nodes)
          const combined = textNodes.map((n) => n.nodeValue || '').join('');
          if (this.hasAnyPlaceholder(combined)) {
            const restored = restore(combined, this.cachedMappings);
            if (restored !== combined) {
              textNodes[0].nodeValue = restored;
              for (let i = 1; i < textNodes.length; i++) {
                textNodes[i].nodeValue = '';
              }
            }
          }
        }
      }
    } finally {
      this.isRestoring = false;
    }
  }
}
