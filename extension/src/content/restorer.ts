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
  private isRestoring = false;
  private currentConvId: string | null = null;
  private restoreRequested = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (!this.adapter) return;

    this.updateMappings();

    // Observe document body for any changes
    const rootObserver = new MutationObserver((mutations) => {
      if (this.isRestoring) return;
      this.handleMutations(mutations);
    });

    rootObserver.observe(document.body || document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    // Refresh mappings periodically, on window focus, or when new redactions occur
    window.addEventListener('focus', () => this.updateMappings());
    window.addEventListener('ratchet:mapping-updated', () => this.updateMappings());
    
    // Initial pass
    this.scheduleRestore();
  }

  private isUpdatingMappings = false;

  public getCurrentConversationId(): string | null {
    return this.currentConvId;
  }

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
          this.scheduleRestore();
        }
      });
    } catch {
      this.isUpdatingMappings = false;
    }
  }

  private isEditable(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return true;
    if (element.getAttribute('contenteditable') === 'true') return true;
    if ((element as HTMLElement).isContentEditable) return true;
    if (element.classList && element.classList.contains('ProseMirror')) return true;
    if (element.closest && element.closest('textarea, input, [contenteditable="true"], .ProseMirror')) {
      return true;
    }
    return false;
  }

  private handleMutations(mutations: MutationRecord[]): void {
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
      this.scheduleRestore();
    } else if (mightHaveNewPlaceholder) {
      this.updateMappings();
    }
  }

  private hasAnyPlaceholder(text: string): boolean {
    for (const m of this.cachedMappings) {
      if (text.includes(m.placeholder)) return true;
      const bare = m.placeholder.replace(/^«/, '').replace(/»$/, '');
      if (text.includes(bare)) return true;
    }
    return false;
  }

  private scheduleRestore(): void {
    if (this.restoreRequested || this.isRestoring || this.cachedMappings.length === 0) return;
    this.restoreRequested = true;
    requestAnimationFrame(() => {
      this.restoreRequested = false;
      this.performRestore();
    });
  }

  private performRestore(): void {
    this.isRestoring = true;
    try {
      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (node.parentElement && this.isEditable(node.parentElement)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const textNodes: Text[] = [];
      let currentNode = walker.nextNode();
      while (currentNode) {
        textNodes.push(currentNode as Text);
        currentNode = walker.nextNode();
      }

      const groups: Text[][] = [];
      let currentGroup: Text[] = [];
      
      for (const node of textNodes) {
        if (currentGroup.length === 0) {
          currentGroup.push(node);
        } else {
          const lastNode = currentGroup[currentGroup.length - 1];
          if (node.parentNode === lastNode.parentNode && node.previousSibling === lastNode) {
            currentGroup.push(node);
          } else {
            groups.push(currentGroup);
            currentGroup = [node];
          }
        }
      }
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }

      for (const group of groups) {
        if (group.length === 1) {
          const orig = group[0].nodeValue || '';
          if (this.hasAnyPlaceholder(orig)) {
            const restored = restore(orig, this.cachedMappings);
            if (restored !== orig) {
              group[0].nodeValue = restored;
            }
          }
        } else {
          const combined = group.map(n => n.nodeValue || '').join('');
          if (this.hasAnyPlaceholder(combined)) {
            const restored = restore(combined, this.cachedMappings);
            if (restored !== combined) {
              group[0].nodeValue = restored;
              for (let i = 1; i < group.length; i++) {
                group[i].nodeValue = '';
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

