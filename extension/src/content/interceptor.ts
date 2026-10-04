

export class ContentInterceptor {
  private inputElement: HTMLElement | null = null;

  constructor() {
    this.init();
    this.addManualButton();
  }

  private addManualButton() {
    const btn = document.createElement('button');
    btn.innerText = '🛡️ Redact Input';
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.right = '20px';
    btn.style.zIndex = '999999';
    btn.style.padding = '12px 20px';
    btn.style.background = '#e74c3c';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '14px';
    btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    
    btn.addEventListener('click', () => {
      let editable = document.querySelector('textarea, [contenteditable="true"]');
      if (editable) {
        this.inputElement = editable as HTMLElement;
        this.handleIntercept();
      } else {
        alert('Ratchet: Could not find any input field on this page.');
      }
    });
    
    document.body.appendChild(btn);
  }

  private init() {
    // Intercept Enter key anywhere
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true')) {
          this.inputElement = active as HTMLElement;
          const text = this.inputElement instanceof HTMLTextAreaElement ? this.inputElement.value : this.inputElement.innerText;
          if (text.trim()) {
            e.preventDefault();
            e.stopPropagation();
            this.handleIntercept();
          }
        }
      }
    }, { capture: true });

    // Intercept Send button clicks
    document.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Look for common send buttons
      const sendButton = target.closest('button[aria-label*="Send"], button[data-testid*="send"], button[aria-label*="message"]');
      if (sendButton) {
        let editable = document.activeElement;
        if (!editable || (editable.tagName !== 'TEXTAREA' && editable.getAttribute('contenteditable') !== 'true')) {
          editable = document.querySelector('textarea, [contenteditable="true"]');
        }
        if (editable) {
          this.inputElement = editable as HTMLElement;
          const text = this.inputElement instanceof HTMLTextAreaElement ? this.inputElement.value : this.inputElement.innerText;
          if (text.trim()) {
            e.preventDefault();
            e.stopPropagation();
            this.handleIntercept();
          }
        }
      }
    }, { capture: true });
  }

  private async handleIntercept() {
    let text = '';
    if (this.inputElement instanceof HTMLTextAreaElement) {
      text = this.inputElement.value;
    } else {
      text = this.inputElement?.innerText || '';
    }

    if (!text.trim()) return;

    try {
      // Send to background script to bypass CSP
      chrome.runtime.sendMessage({ action: 'redact', text }, (response) => {
        if (response && response.success) {
          const data = response.data;
          
          // Replace text in UI
          if (this.inputElement instanceof HTMLTextAreaElement) {
            this.inputElement.value = data.redacted_text;
            this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            if (this.inputElement) {
              this.inputElement.focus();
              
              // Safer selection for ProseMirror/React editors
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(this.inputElement);
              selection?.removeAllRanges();
              selection?.addRange(range);
              
              const success = document.execCommand('insertText', false, data.redacted_text);
              if (!success) {
                // Fallback if insertText fails
                let p = this.inputElement.querySelector('p');
                if (p) {
                  p.textContent = data.redacted_text;
                } else {
                  this.inputElement.textContent = data.redacted_text;
                }
                this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          }
          
          // If we want to simulate enter key, we can do it here.
          // But since it's a manual button, we leave it to the user.
        } else {
          alert('Ratchet Error: ' + (response?.error || 'Unknown error contacting background script'));
        }
      });
    } catch (e) {
      alert('Ratchet Interception Failed: ' + e);
    }
  }
}
