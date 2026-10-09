/**
 * Ratchet Privacy Shield — Review-Before-Send Overlay Panel
 *
 * Implements a closed Shadow DOM overlay (mode: 'closed') injected by the
 * ISOLATED content script. Displays detected sensitive items before prompts
 * leave the browser.
 *
 * Security & Isolation Guarantees:
 * - Uses host.attachShadow({ mode: 'closed' }) so page scripts cannot access
 *   the shadow root or inner DOM nodes via element.shadowRoot.
 * - Original values never reach page DOM, console logs, or MAIN-world window messages.
 * - Enforces fail-closed timeout: if time expires, cancels prompt dispatch.
 */

export interface ReviewItem {
  category: string;
  original: string;
  placeholder: string;
}

export interface ReviewPanelOptions {
  items: ReviewItem[];
  originalText: string;
  redactedText: string;
  timeoutSeconds?: number;
  skippedRules?: string[];
  warnings?: string[];
  onSend: (finalWireText: string, manualMappings?: Array<{ placeholder: string; original: string; type: string }>) => void;
  onCancel: (reason: string) => void;
  onSessionExempt?: (originalValue: string) => void;
  onAddSensitiveTerm?: (term: string, category: string) => void;
}

let activePanelCleanup: (() => void) | null = null;

export function showReviewPanel(options: ReviewPanelOptions): { close: () => void } {
  // If an existing panel is active, close it first
  if (activePanelCleanup) {
    activePanelCleanup();
  }

  const timeoutSeconds = options.timeoutSeconds ?? 60;
  let remainingSeconds = timeoutSeconds;

  // Track per-item un-redact state (true = keep original on wire)
  const unredactedStates: boolean[] = options.items.map(() => false);
  // Track per-item session exemption checkbox
  const sessionExemptions: boolean[] = options.items.map(() => false);

  // 1. Create Host Element and Closed Shadow Root
  const host = document.createElement('div');
  host.id = 'ratchet-review-host';
  Object.assign(host.style, {
    all: 'initial',
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483647',
    pointerEvents: 'auto',
  });

  const shadow = host.attachShadow({ mode: 'closed' });

  // 2. Build Internal Styles
  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .modal {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 14px;
      width: 100%;
      max-width: 620px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      color: #f8fafc;
      overflow: hidden;
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .title-area {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .shield-badge {
      font-size: 20px;
      line-height: 1;
    }
    .title {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #f1f5f9;
    }
    .subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .timer-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .content {
      padding: 20px 24px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .items-count-banner {
      font-size: 13px;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(30, 41, 59, 0.6);
      border-radius: 8px;
    }
    .items-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .item-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.15s ease;
    }
    .item-card.unredacted {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.05);
    }
    .item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .cat-badge {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 7px;
      border-radius: 5px;
      background: #3b82f6;
      color: #ffffff;
    }
    .cat-badge.person { background: #8b5cf6; }
    .cat-badge.org { background: #0ea5e9; }
    .cat-badge.location { background: #10b981; }
    .cat-badge.api_key { background: #f43f5e; }
    .cat-badge.credit_card { background: #ec4899; }
    .cat-badge.phone { background: #14b8a6; }
    .cat-badge.ssn, .cat-badge.cnic { background: #ef4444; }
    .cat-badge.email { background: #6366f1; }

    .btn-toggle-unredact {
      background: transparent;
      border: 1px solid #475569;
      color: #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-toggle-unredact:hover {
      background: #334155;
      color: #ffffff;
    }
    .btn-toggle-unredact.active {
      background: #f59e0b;
      border-color: #f59e0b;
      color: #0f172a;
    }
    .item-details {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      word-break: break-all;
    }
    .orig-val {
      color: #f87171;
      background: rgba(239, 68, 68, 0.12);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .item-card.unredacted .orig-val {
      color: #4ade80;
      background: rgba(74, 222, 128, 0.12);
    }
    .arrow {
      color: #64748b;
      font-weight: 700;
    }
    .placeholder-val {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .item-card.unredacted .placeholder-val {
      text-decoration: line-through;
      color: #64748b;
      background: transparent;
    }
    .session-exempt-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #94a3b8;
      margin-top: 2px;
    }
    .session-exempt-row input {
      accent-color: #6366f1;
      cursor: pointer;
    }
    .footer {
      padding: 16px 24px;
      border-top: 1px solid #1e293b;
      background: rgba(15, 23, 42, 0.95);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-cancel {
      background: #1e293b;
      border-color: #334155;
      color: #cbd5e1;
    }
    .btn-cancel:hover {
      background: #334155;
      color: #ffffff;
    }
    .btn-asis {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.3);
      color: #fbbf24;
    }
    .btn-asis:hover {
      background: rgba(245, 158, 11, 0.22);
    }
    .btn-send {
      background: #4f46e5;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    .btn-send:hover {
      background: #4338ca;
    }
    .confirm-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 12px;
      margin-top: 10px;
      display: none;
      flex-direction: column;
      gap: 8px;
    }
    .confirm-box.visible {
      display: flex;
    }
    .confirm-title {
      font-size: 13px;
      font-weight: 700;
      color: #f87171;
    }
    .confirm-desc {
      font-size: 12px;
      color: #fca5a5;
    }
    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .btn-confirm-yes {
      background: #dc2626;
      color: #fff;
    }
    .btn-confirm-no {
      background: #334155;
      color: #e2e8f0;
    }
    .skipped-rules-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      border-radius: 8px;
      padding: 12px 14px;
      color: #fca5a5;
      font-size: 13px;
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .skipped-rules-banner .banner-title {
      font-weight: 700;
      color: #f87171;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    .skipped-rules-banner .rules-list {
      margin-left: 20px;
      margin-top: 4px;
      color: #fecaca;
      font-size: 12px;
    }
    .preview-section {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .preview-box {
      font-size: 13px;
      line-height: 1.5;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #e2e8f0;
      user-select: text;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow-y: auto;
      padding: 8px 10px;
      background: rgba(30, 41, 59, 0.4);
      border-radius: 6px;
      border: 1px solid rgba(51, 65, 85, 0.4);
    }
    .preview-box::selection {
      background: #4f46e5;
      color: #ffffff;
    }
    .manual-toolbar {
      display: none;
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 8px 10px;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      flex-wrap: wrap;
    }
    .manual-toolbar.active {
      display: flex;
    }
    .manual-selected-text {
      color: #38bdf8;
      font-weight: 600;
      max-width: 130px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .manual-cat-select {
      background: #0f172a;
      border: 1px solid #475569;
      color: #f8fafc;
      font-size: 11px;
      padding: 3px 6px;
      border-radius: 4px;
    }
    .manual-btn-redact {
      background: #6366f1;
      border: none;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .manual-btn-redact:hover {
      background: #4f46e5;
    }
    .manual-add-terms-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #cbd5e1;
      cursor: pointer;
    }
  `;
  shadow.appendChild(style);

  // 3. Build HTML Structure inside Shadow Root
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'ratchet-panel-title');

  // Header
  const header = document.createElement('div');
  header.className = 'header';

  const hasSkipped = options.skippedRules && options.skippedRules.length > 0;
  const subtitleText = hasSkipped
    ? '⚠️ Warning: One or more custom rules were skipped. Review prompt before sending.'
    : 'Ratchet detected sensitive data. Choose what gets redacted before sending.';

  const titleArea = document.createElement('div');
  titleArea.className = 'title-area';
  titleArea.innerHTML = `
    <span class="shield-badge">🛡️</span>
    <div>
      <div id="ratchet-panel-title" class="title">Review Outgoing Prompt</div>
      <div class="subtitle">${subtitleText}</div>
    </div>
  `;

  const timerBadge = document.createElement('div');
  timerBadge.className = 'timer-badge';
  timerBadge.id = 'ratchet-timer-badge';
  timerBadge.textContent = `Cancels in ${remainingSeconds}s`;

  header.appendChild(titleArea);
  header.appendChild(timerBadge);
  modal.appendChild(header);

  // Content Area
  const content = document.createElement('div');
  content.className = 'content';

  if (hasSkipped) {
    const skippedBanner = document.createElement('div');
    skippedBanner.className = 'skipped-rules-banner';
    skippedBanner.id = 'ratchet-skipped-rules-warning';
    skippedBanner.innerHTML = `
      <div class="banner-title">
        <span>⚠️</span>
        <span>Custom Rule Skipped — Prompt Not Fully Protected</span>
      </div>
      <div>
        The following custom rule(s) were skipped (unsafe syntax or execution time budget exceeded):
        <ul class="rules-list">
          ${options.skippedRules!.map((r) => `<li><strong>${escapeHtml(r)}</strong></li>`).join('')}
        </ul>
        <div style="font-size: 11px; color: #fca5a5; margin-top: 4px;">
          Unchecked data matching these rules may remain in your prompt. Review before sending or cancel.
        </div>
      </div>
    `;
    content.appendChild(skippedBanner);
  }

  const countBanner = document.createElement('div');
  countBanner.className = 'items-count-banner';
  countBanner.innerHTML = options.items.length > 0
    ? `<span><strong>${options.items.length}</strong> items detected</span>
       <span style="font-size: 12px; color: #94a3b8;">Original values stay local</span>`
    : `<span><strong>0</strong> standard items detected</span>
       <span style="font-size: 12px; color: #f87171;">Custom rule skipped</span>`;
  content.appendChild(countBanner);

  let currentRedactedText = options.redactedText;
  const manualMappings: Array<{ placeholder: string; original: string; type: string }> = [];

  // Prompt Preview & Manual Redaction Section
  const previewSection = document.createElement('div');
  previewSection.className = 'preview-section';
  previewSection.id = 'ratchet-preview-section';

  const previewHeader = document.createElement('div');
  previewHeader.className = 'preview-header';
  previewHeader.innerHTML = `
    <span>Prompt Preview</span>
    <span style="font-size: 11px; color: #64748b; font-weight: normal; text-transform: none;">Select text to redact</span>
  `;

  const previewBox = document.createElement('div');
  previewBox.id = 'ratchet-preview-text';
  previewBox.className = 'preview-box';
  previewBox.textContent = currentRedactedText;

  const manualToolbar = document.createElement('div');
  manualToolbar.id = 'ratchet-manual-toolbar';
  manualToolbar.className = 'manual-toolbar';
  manualToolbar.innerHTML = `
    <span>Selected:</span>
    <span id="ratchet-selected-text" class="manual-selected-text"></span>
    <select id="ratchet-manual-category" class="manual-cat-select">
      <option value="PERSON">Name (PERSON)</option>
      <option value="ORG">Employer (ORG)</option>
      <option value="PROJECT">Project (PROJECT)</option>
      <option value="LOCATION">Place (LOCATION)</option>
    </select>
    <label class="manual-add-terms-label">
      <input type="checkbox" id="ratchet-cb-add-terms" checked />
      <span>Also add to My sensitive terms</span>
    </label>
    <button type="button" id="ratchet-btn-manual-redact" class="manual-btn-redact">
      Redact All Occurrences
    </button>
  `;

  previewSection.appendChild(previewHeader);
  previewSection.appendChild(previewBox);
  previewSection.appendChild(manualToolbar);
  content.appendChild(previewSection);

  // Items List
  const itemsList = document.createElement('div');
  itemsList.className = 'items-list';

  const renderItemCard = (item: ReviewItem, idx: number) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.id = `ratchet-item-${idx}`;

    const catClass = item.category.toLowerCase().replace(/[^a-z0-9_]/g, '');

    card.innerHTML = `
      <div class="item-top">
        <span class="cat-badge ${catClass}">${escapeHtml(item.category)}</span>
        <button type="button" class="btn-toggle-unredact" data-idx="${idx}">
          Un-redact
        </button>
      </div>
      <div class="item-details">
        <span class="orig-val">${escapeHtml(item.original)}</span>
        <span class="arrow">➔</span>
        <span class="placeholder-val">${escapeHtml(item.placeholder)}</span>
      </div>
      <label class="session-exempt-row">
        <input type="checkbox" class="session-exempt-cb" data-idx="${idx}">
        <span>Don't redact this again this session</span>
      </label>
    `;

    // Hook un-redact toggle
    const toggleBtn = card.querySelector<HTMLButtonElement>('.btn-toggle-unredact');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        unredactedStates[idx] = !unredactedStates[idx];
        if (unredactedStates[idx]) {
          card.classList.add('unredacted');
          toggleBtn.classList.add('active');
          toggleBtn.textContent = 'Keep Original ✓';
        } else {
          card.classList.remove('unredacted');
          toggleBtn.classList.remove('active');
          toggleBtn.textContent = 'Un-redact';
        }
      });
    }

    // Hook session exemption checkbox
    const exemptCb = card.querySelector<HTMLInputElement>('.session-exempt-cb');
    if (exemptCb) {
      exemptCb.addEventListener('change', () => {
        sessionExemptions[idx] = exemptCb.checked;
      });
    }

    itemsList.appendChild(card);
  };

  options.items.forEach((item, idx) => {
    renderItemCard(item, idx);
  });

  // Manual Redaction Interaction
  let selectedPhrase = '';
  const selectedTextSpan = manualToolbar.querySelector('#ratchet-selected-text')!;
  const catSelect = manualToolbar.querySelector<HTMLSelectElement>('#ratchet-manual-category')!;
  const cbAddTerms = manualToolbar.querySelector<HTMLInputElement>('#ratchet-cb-add-terms')!;
  const btnManualRedact = manualToolbar.querySelector<HTMLButtonElement>('#ratchet-btn-manual-redact')!;

  const handleSelection = () => {
    const sel = (shadow as any).getSelection ? (shadow as any).getSelection() : window.getSelection();
    const str = sel ? sel.toString().trim() : '';
    if (str.length > 0 && !str.includes('«') && !str.includes('»')) {
      selectedPhrase = str;
      selectedTextSpan.textContent = `"${str}"`;
      manualToolbar.classList.add('active');
    }
  };

  previewBox.addEventListener('mouseup', handleSelection);
  previewBox.addEventListener('keyup', handleSelection);
  shadow.addEventListener('mouseup', handleSelection);

  btnManualRedact.addEventListener('click', () => {
    if (!selectedPhrase) return;
    const phrase = selectedPhrase;
    const cat = catSelect.value;
    const addTerms = cbAddTerms.checked;

    // Calculate next counter for this category
    const catCount = options.items.filter((i) => i.category === cat).length + 1;
    const placeholder = `«${cat}_${catCount}»`;

    // Redact every occurrence in currentRedactedText (case-insensitive, whole-word)
    const escaped = escapeRegex(phrase);
    const re = new RegExp(`\\b${escaped}(?:['’]s\\b|['’](?!\\w)|\\b)`, 'gi');
    currentRedactedText = currentRedactedText.replace(re, placeholder);
    previewBox.textContent = currentRedactedText;

    const newItem: ReviewItem = {
      category: cat,
      original: phrase,
      placeholder,
    };
    const newIdx = options.items.length;
    options.items.push(newItem);
    unredactedStates.push(false);
    sessionExemptions.push(false);
    manualMappings.push({
      placeholder,
      original: phrase,
      type: cat,
    });

    renderItemCard(newItem, newIdx);
    countBanner.innerHTML = `<span><strong>${options.items.length}</strong> items detected</span>
      <span style="font-size: 12px; color: #94a3b8;">Original values stay local</span>`;

    if (addTerms && options.onAddSensitiveTerm) {
      options.onAddSensitiveTerm(phrase, cat);
    }

    selectedPhrase = '';
    manualToolbar.classList.remove('active');
  });

  content.appendChild(itemsList);

  // Send As-Is Confirmation Box
  const confirmBox = document.createElement('div');
  confirmBox.className = 'confirm-box';
  confirmBox.id = 'ratchet-confirm-asis-box';
  confirmBox.innerHTML = `
    <div class="confirm-title">⚠️ Send unredacted data over the wire?</div>
    <div class="confirm-desc">All sensitive items will be sent in plain text without protection.</div>
    <div class="confirm-actions">
      <button type="button" class="btn btn-confirm-no" id="ratchet-confirm-no">Back</button>
      <button type="button" class="btn btn-confirm-yes" id="ratchet-confirm-yes">Send As-Is Now</button>
    </div>
  `;
  content.appendChild(confirmBox);

  modal.appendChild(content);

  // Footer Actions
  const footer = document.createElement('div');
  footer.className = 'footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.id = 'ratchet-btn-cancel';
  cancelBtn.className = 'btn btn-cancel';
  cancelBtn.textContent = 'Cancel (Esc)';

  const sendAsIsBtn = document.createElement('button');
  sendAsIsBtn.type = 'button';
  sendAsIsBtn.id = 'ratchet-btn-asis';
  sendAsIsBtn.className = 'btn btn-asis';
  sendAsIsBtn.textContent = 'Send As-Is';

  const sendRedactedBtn = document.createElement('button');
  sendRedactedBtn.type = 'button';
  sendRedactedBtn.id = 'ratchet-btn-send';
  sendRedactedBtn.className = 'btn btn-send';
  sendRedactedBtn.textContent = 'Send Redacted (Enter)';

  footer.appendChild(cancelBtn);
  footer.appendChild(sendAsIsBtn);
  footer.appendChild(sendRedactedBtn);
  modal.appendChild(footer);

  backdrop.appendChild(modal);
  shadow.appendChild(backdrop);
  document.documentElement.appendChild(host);

  // 4. Action Handlers

  let isClosed = false;

  const closePanel = () => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(timerInterval);
    window.removeEventListener('keydown', handleKeydown, true);
    if (host.parentElement) {
      host.remove();
    }
    if (activePanelCleanup === closePanel) {
      activePanelCleanup = null;
    }
  };

  const handleSendRedacted = () => {
    // Build final wire text by starting from currentRedactedText (which includes any manual redactions),
    // and replacing back any items marked as un-redacted
    let finalWireText = currentRedactedText;
    options.items.forEach((item, idx) => {
      if (unredactedStates[idx]) {
        finalWireText = finalWireText.split(item.placeholder).join(item.original);
      }
      if (sessionExemptions[idx] && options.onSessionExempt) {
        options.onSessionExempt(item.original);
      }
    });

    closePanel();
    options.onSend(finalWireText, manualMappings);
  };

  const handleCancel = (reason: string) => {
    closePanel();
    options.onCancel(reason);
  };

  const handleSendAsIs = () => {
    confirmBox.classList.add('visible');
  };

  // Button Listeners
  sendRedactedBtn.addEventListener('click', handleSendRedacted);
  cancelBtn.addEventListener('click', () => handleCancel('user_cancelled'));
  sendAsIsBtn.addEventListener('click', handleSendAsIs);

  confirmBox.querySelector('#ratchet-confirm-no')?.addEventListener('click', () => {
    confirmBox.classList.remove('visible');
  });

  confirmBox.querySelector('#ratchet-confirm-yes')?.addEventListener('click', () => {
    closePanel();
    options.onSend(options.originalText);
  });

  // 5. Keyboard Shortcut Listeners (Enter / Esc)
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel('user_cancelled');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // If confirmation box is open, enter confirms send-as-is
      if (confirmBox.classList.contains('visible')) {
        e.preventDefault();
        e.stopPropagation();
        closePanel();
        options.onSend(options.originalText);
      } else {
        e.preventDefault();
        e.stopPropagation();
        handleSendRedacted();
      }
    }
  };

  window.addEventListener('keydown', handleKeydown, true);

  // 6. Fail-Closed Countdown Timer
  const timerInterval = setInterval(() => {
    remainingSeconds--;
    if (timerBadge) {
      timerBadge.textContent = `Cancels in ${remainingSeconds}s`;
    }
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      handleCancel('timeout');
    }
  }, 1000);

  activePanelCleanup = closePanel;

  return { close: closePanel };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
