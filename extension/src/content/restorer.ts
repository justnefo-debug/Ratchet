export class ContentRestorer {
  private observer: MutationObserver;

  constructor() {
    this.observer = new MutationObserver(this.handleMutations.bind(this));
    this.init();
  }

  private init() {
    // Observe DOM for AI responses
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private async handleMutations(mutations: MutationRecord[]) {
    // In a real implementation, this would carefully target only new text nodes 
    // inside the AI response container to avoid performance issues
    
    // Simplistic approach for demo:
    for (const m of mutations) {
      if (m.type === 'characterData' || m.type === 'childList') {
        // check for placeholders like [PERSON_1]
        const textNodes = this.findTextNodesWithPlaceholders(m.target);
        for (const node of textNodes) {
          await this.restoreNode(node);
        }
      }
    }
  }

  private findTextNodesWithPlaceholders(node: Node): Text[] {
    const textNodes: Text[] = [];
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    let n: Node | null;
    while(n = walk.nextNode()) {
      if (n.nodeValue && /\[[A-Z_]+\_\d+\]/.test(n.nodeValue)) {
        textNodes.push(n as Text);
      }
    }
    return textNodes;
  }

  private async restoreNode(node: Text) {
    if (!node.nodeValue) return;
    
    try {
      // If we don't have a session ID, in a real app we'd fetch the latest active session
      // For this scaffold, we'll assume we can ask the backend to restore based on the most recent mapping
      const res = await fetch('http://localhost:5000/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: node.nodeValue, session_id: 'latest' })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.restored_text !== node.nodeValue) {
          node.nodeValue = data.restored_text;
        }
      }
    } catch (e) {
      // Ignore
    }
  }
}
