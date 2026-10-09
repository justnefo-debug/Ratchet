# Ratchet Privacy Shield — Architecture Status & Roadmap

> **Current Branch:** `version1`  
> **Last Updated:** October 9, 2026  
> **Repository Context:** Browser-native MV3 privacy shield with zero Python runtime dependency.

---

## 1. Core Architecture Decisions

### 1.1 Network-Level Interception in MAIN-World Script
- **Mechanism:** Injected script running in the webpage execution context (`MAIN` world) wraps `window.fetch` and `XMLHttpRequest`.
- **Rationale:** Web-based chat interfaces (ChatGPT, Claude, Gemini) use complex virtualized and rich-text document models (ProseMirror, Lexical, React controlled inputs). Manipulating DOM inputs directly (`value`, `innerText`, `execCommand`) fails to update internal framework state, triggers infinite mutation loops, or risks submitting raw PII over the wire. Intercepting the prompt payload at the network boundary guarantees that only redacted payloads ever leave the browser.
- **Isolation:** The MAIN-world wrapper communicates with the extension via `window.postMessage` using secure token validation and payload envelopes. Raw PII is redacted before the wire request is dispatched.

### 1.2 DOM-Only Restoration in ISOLATED World
- **Mechanism:** The response restorer operates in the Chrome extension's `ISOLATED` world using a scoped `MutationObserver` and `TreeWalker` to detect placeholder tokens (`«TYPE_N»`) in target message containers. Mappings are queried from the background service worker, and DOM text nodes are updated in place.
- **Security Boundary & Page DOM Visibility:**
  - Original mapping dictionaries and cryptographic keys are kept in the extension execution context and never injected into `window`.
  - **Restored Values Readable in Page DOM:** Restored text values live directly in the page DOM so the user can read the output. Consequently, page scripts running on the target origin (e.g., ChatGPT or Claude frontend JavaScript) **can read restored values once rendered in the DOM**. Client-side restoration prevents sensitive data from leaving the browser over the wire to the AI backend, but cannot conceal text displayed in the page DOM from the page's own scripts.

### 1.3 Mappings in Service Worker via `chrome.storage.session` Keyed by Conversation
- **Keying Scheme:** Mappings are keyed per conversation (e.g., `conv:<conversation_id>`) extracted from site URLs or assigned session identifiers.
- **Lifecycle & Storage:**
  - **Ephemeral by Default:** Stored in `chrome.storage.session`, providing in-memory performance that survives MV3 service worker idle termination and restarts, while automatically purging all mapping state when the browser session ends.
  - **Encrypted Persistence (Optional):** When enabled by user preference, mappings are persisted to `chrome.storage.local` encrypted using AES-GCM (256-bit non-extractable key generated directly via `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])` and stored in IndexedDB) with an explicit time-to-live (TTL) expiry setting.
- **Scope Isolation:** Avoids cross-conversation mapping collisions and ensures multi-turn conversations retain placeholder stability.

### 1.4 Fail-Closed Security Policy
- **Strict Invariant:** If any redaction failure occurs—including service worker unreachability, detection error, custom regex timeout, or validation failure—the network request is immediately aborted and cancelled.
- **Skipped Custom Rules Policy:** If a user-defined custom rule is skipped at runtime (due to ReDoS-unsafe pattern syntax, regex evaluation failure, or exceeding the 25ms per-rule execution budget), the prompt **must never dispatch silently**. Ratchet enforces fail-closed containment:
  - The Review-Before-Send panel is **automatically forced open** (even if review toggles are disabled or 0 standard entities were detected).
  - The panel displays a prominent alert banner naming each skipped rule and warning that unredacted matches may remain in the prompt.
  - If the user cancels the review panel (via Cancel button or `Esc` key) or if the review timer expires, the outgoing request is completely blocked on the wire (0 requests dispatched) and a privacy notice naming the skipped rule is shown.
  - The request is only transmitted if the user explicitly reviews the prompt and confirms sending.
- **User Feedback & Usability:** A clear, non-intrusive warning notice is displayed to the user explaining that the request was stopped to prevent data leakage. The chat input is preserved intact so the user does not lose typed work and the chat interface remains usable.
- **Zero Leakage Tolerance:** Prompts are never allowed to fall through to the network in an unredacted state upon system errors or skipped rule conditions.

### 1.5 Threat Model & Security Boundaries
- **Network Interception Boundary:** Interception occurs in a `MAIN` world script wrapping `window.fetch` and `XMLHttpRequest`. Prompts are sanitized at the network edge before leaving the browser. External network observers, AI backend APIs, and proxy servers only ever see placeholder tokens (e.g. `«PERSON_1»`).
- **Page Script Isolation:** All mapping dictionaries, NER lookup tables, and the Review-Before-Send UI execute in the extension's `ISOLATED` world and background Service Worker. The review panel uses a closed Shadow DOM (`host.attachShadow({ mode: 'closed' })`), ensuring `host.shadowRoot === null` to page scripts.
- **Restored DOM Visibility (Inherent Boundary):** Restored text nodes in the assistant response live directly in the page DOM so the user can read the output. Consequently, page scripts running on the target origin (e.g., ChatGPT or Claude frontend JavaScript) CAN read restored values once rendered in the DOM. This is an inherent property of in-browser client-side restoration.
- **Storage & Cryptographic Boundaries:**
  - Ephemeral session mappings reside in memory-backed `chrome.storage.session` and are purged on browser exit.
  - Optional persistence uses AES-GCM 256-bit keys with `extractable: false` via WebCrypto API.
  - *Threat Model Scope:* WebCrypto prevents scripts from exporting the raw key material and protects local records against casual storage dumps. However, because keys (IndexedDB) and ciphertexts (`chrome.storage.local`) reside in the same browser profile directory, this DOES NOT protect against an attacker with read access to the browser's profile directory on disk, nor against malware with browser process memory inspection capabilities.
- **Custom-Rule Safety & Input Length Cap:** User-defined regex rules are restricted to a ReDoS-safe linear-time subset (no nested repetition, no overlapping adjacent wildcards, no repeated alternations) and capped at 200 characters to prevent background worker denial of service.

### 1.6 System Defaults & Configuration Reference
- **Global Shield:** `enabled = true`
- **Detection Sensitivity:** `sensitivity = 'medium'` (threshold: 0.65; low = 0.85, high = 0.45)
- **Supported Sites:** `enabledSites = { chatgpt: true, claude: true }` (Gemini is not supported yet and excluded from matches/permissions)
- **Review Before Sending:** `reviewBeforeSend = true` (default on for supported sites)
- **Review Timeout:** `reviewTimeoutSeconds = 60` (fail-closed timeout countdown)
- **Review Sites:** `reviewSites = { chatgpt: true, claude: true, mock: false }`
- **Persistence:** `enablePersistence = false` (session-only by default)
- **Persistence TTL:** `persistenceExpiryHours = 24`
- **Protected Entity Toggles:** All 14 built-in categories enabled by default (`EMAIL`, `PHONE`, `API_KEY`, `CREDIT_CARD`, `SSN`, `CNIC`, `IPV4`, `IPV6`, `MAC_ADDRESS`, `URL_WITH_CREDS`, `DATE_OF_BIRTH`, `PERSON`, `ORG`, `LOCATION`)
- **Custom Rules:** `customRules = []` (max 200 chars per regex pattern)
- **Power Mode:** `powerMode = false`

---

## 2. Stage Delivery Summary

| Stage | Milestone | Deliverables & Verified Behavior | Status |
| :--- | :--- | :--- | :--- |
| **Stage 1** | Build Setup & MV3 Manifest | Configured Vite and TypeScript build pipeline with `base: './'`. Generated unpacked Chrome MV3 manifest without external dependencies or root-relative path resolution bugs. | ✅ Complete |
| **Stage 2** | Detection, Redaction & Storage | High-speed regex detectors for structured PII (emails, phone numbers, SSNs, credit cards with Luhn validation, API keys, IP addresses, dates of birth). Guillemet placeholder format (`«TYPE_N»`). Implemented per-conversation mapping store in `chrome.storage.session`. | ✅ Complete |
| **Stage 3** | Interception, Restoration & Adapters | MAIN-world `fetch`/XHR interceptor with `postMessage` bridge. Site adapters for ChatGPT and Claude completion endpoints. Fail-closed error handling. ISOLATED-world streaming DOM restoration. Test harness with local mock chat server. Sanitized production manifest eliminating localhost permissions. | ✅ Complete |
| **Stage 4** | Settings, Persistence & ReDoS Security | Options page with custom rules editor, entity category toggles, and sensitivity threshold controls. Client-side ReDoS validator with hard timeout. Optional AES-GCM encrypted persistence in `chrome.storage.local`. Popup UI with live session stats. | ✅ Complete |
| **Stage 5** | Gazetteer & Context Rule NER | Offline, zero-network Radix-Trie gazetteer detector for names, organizations, and locations. Morphosyntactic context rules and negative filters (code identifiers, file paths). Held-out test evaluation harness and live E2E integration test. | ✅ Complete |
| **Stage 6** | Review-Before-Send Panel | Closed Shadow DOM overlay (`mode: 'closed'`) in ISOLATED world displaying detected items with category and original -> placeholder. Per-site toggles, timeout countdown with fail-closed cancellation, individual item un-redact, send as-is warning modal, ephemeral session exemption list, keyboard shortcuts (Enter / Esc). 6 dedicated Playwright E2E tests passing (17 total). | ✅ Complete |

---

## 3. Pending Fixes & Resolved Audits

### 3.1 Completed Fixes
1. **Data Provenance (Fix 1 - Completed):**
   - Verified exact entry counts in `src/detectors/gazetteer-data.json` (22.5 KB):
     - First Names: 159
     - Last Names: 149
     - Organizations: 99
     - Locations: 117
     - Total: 524 curated entries
   - Clarified that no bulk external datasets (US Census, GeoNames, SEC EDGAR, Wikidata) were downloaded.
   - Rewrote `NOTICE` to explicitly disclose that all 524 entries are hand-curated seed lists dedicated under CC0 1.0 Universal Public Domain Dedication.
2. **Evaluation Integrity (Fix 2 - Completed):**
   - Documented that 98.6% (211 of 214 entities) in the initial `held-out-eval.json` shared vocabulary with the gazetteer.
   - Synchronized detector logic in `scripts/eval-ner.mjs` and `src/detectors/gazetteer-ner-backend.ts` (fixed person span boundary arithmetic, aligned regex boundary filters).
   - Created secondary out-of-vocabulary dataset `tests/data/unknown-entities-eval.json` (34 prompts, 34 entities, 0% gazetteer overlap) covering rare personal names, small towns, boutique companies, and misspellings.
   - Evaluated and reported real numbers:
     - Primary Held-Out (98.6% overlap): Precision 98.6%, Recall 95.3%, F1 96.9%
     - Unknown Entities (0% overlap, Medium Sensitivity): Recall 0.0% (strict gazetteer behavior)
     - Unknown Entities (0% overlap, High Sensitivity): Recall 29.4% (proper noun multi-word sequence heuristics)
   - Updated `scripts/eval-ner.mjs` to accept custom user prompt JSON files via CLI argument (`node scripts/eval-ner.mjs [file.json] [--sensitivity <level>]`).
3. **Custom-Rule Timeout in Extension Service Worker (Fix 3 - Completed):**
   - Confirmed that dedicated `Worker` constructors cannot be instantiated in MV3 Service Workers.
   - Identified that slow/catastrophic backtracking patterns (e.g. `x*x*x*x*y`) could freeze the background thread for seconds on long inputs.
   - Selected and implemented the **ReDoS-safe regex subset** approach:
     - Outlaws nested quantifiers (`(a+)+`), repeated alternations with overlaps, and adjacent overlapping unbounded quantifiers (`x*x*`, `.*.*`).
     - Scales dynamic timing checks in `validateRegexSafety` to test inputs up to 200 characters.
     - Adds runtime safe-subset verification in `detectWithCustomRules` to immediately skip violating patterns before `RegExp` instantiation.
   - Added automated Playwright test (Test 12 in `e2e.spec.ts`) verifying options UI pattern rejection and runtime resilience without worker stalls.
4. **Memory Profiling Audit & Process Breakdown (Fix 4 - Completed):**
   - Clarified that the 4.46 MB figure measured by CDP `Performance.getMetrics` originates from the active web page tab context (the renderer process hosting the chat DOM and injected content script), not the extension's service worker.
   - True process-isolated memory measurements:

| Process Context | Measured JS Heap | Working Set (Private OS Memory) | Role / Lifecycle |
| :--- | :---: | :---: | :--- |
| **Web Page Tab (Renderer Process)** | ~1.4 – 1.7 MB (idle page) to ~4.48 MB (heavy conversation) | ~80 – 120 MB | Hosts target chat DOM, user interactions, injected content script, and closed Shadow DOM review overlay. |
| **Extension Background Service Worker** | ~1.5 – 2.5 MB (post-NER load, 527 KB compiled Trie) | ~35 – 50 MB | Coordinates detection, manages conversation mappings in `chrome.storage.session`, terminates when idle. |
| **Total Extension Overhead** | < 5.0 MB V8 Heap | Well within 50 MB budget | Fully browser-native MV3; zero background daemon or Python runtime. |

---

## 4. Stage 6: Review-Before-Send Architecture & Verification

### 4.1 Security & Isolation Architecture
- **Closed Shadow DOM Overlay:** Created directly on `document.documentElement` by the `ISOLATED` world script using `host.attachShadow({ mode: 'closed' })`. Page scripts querying `host.shadowRoot` receive strictly `null`, and `host.innerText` / `host.innerHTML` are empty.
- **Zero Raw PII Exposure:**
  - Raw PII is never emitted to console logs.
  - Raw PII is never emitted over `window.postMessage` between `RATCHET_MAIN` and `RATCHET_ISOLATED`. Only the final transformed text destined for the wire is returned.
  - Page-level DOM nodes outside the closed shadow DOM never contain extension-injected PII.
- **Fail-Closed Network Wrapper:** The MAIN-world interceptor wraps `fetch` and `XMLHttpRequest`, holding outgoing requests in flight until user decision. On cancel or timeout, the request is cleanly aborted and rejected with no bytes transmitted over the wire.
- **Chat UI Preservation:** Canceling or timing out displays an alert notice and leaves the chat UI input box intact and interactive, allowing the user to edit or retry without page refresh.

### 4.2 Actions & User Controls
1. **Send Redacted (Default, `Enter` key):** Transmits redacted prompt with placeholders.
2. **Cancel (`Esc` key or Cancel button):** Aborts request immediately, dispatches 0 requests over the wire, and displays warning notice.
3. **Un-Redact Single Item:** Clicking "Un-redact" on any card restores that specific original value on the wire while leaving all other detected items redacted with placeholders.
4. **Send As-Is:** Displays a confirmation warning modal (`⚠️ Send unredacted data over the wire?`). If confirmed (or confirmed via Enter), sends original prompt in plain text.
5. **Manual Redaction & Term Enrollment:** User selects any text span in the prompt preview, chooses category, redacts all occurrences in message in real time, and optionally enrolls the term into "My sensitive terms" locally.
6. **Session-Only Exemption List:** Checkbox on each item card ("Don't redact this again this session") adds the value to an in-memory `Set` on the content script. Exempted items are un-redacted on subsequent prompts in the session without triggering the review modal.
7. **Configurable Timeouts:** Per-site toggles ("Review before sending", default on for ChatGPT and Claude) and configurable review timeout seconds (default 60s) in Options and Popup UI.

### 4.3 Automated E2E Test Suite (Playwright)
All 20 E2E tests pass (`npm run test:e2e`):
- **Test 0:** Production dist/manifest.json contains NO localhost or 127.0.0.1 entries.
- **Test 1, 2 & 3:** Multi-turn conversation round-trip with textarea and contenteditable variants.
- **Test 4:** Survives service worker termination and restores follow-up from session storage.
- **Test 5:** Enforces fail-closed security when worker is unreachable (blocks request, shows notice).
- **Test 6:** Options page validates ReDoS in UI, adds safe custom rule, and executes clear-all-mappings.
- **Test 7:** Popup UI renders status, controls, and session category summary.
- **Test 8:** Site toggled off leaves request body unchanged and popup shows site as unprotected.
- **Test 9:** Low vs High sensitivity changes what is redacted on the same input.
- **Test 10:** Persistence on survives browser close & reopen, follow-up restores, and expiry prunes mapping.
- **Test 11:** Stage 5 NER round-trip: name, org, and location are redacted on the wire and restored in the display.
- **Test 12:** Custom-rule ReDoS protection in real extension: rejects slow patterns in UI and runtime guard prevents worker hang.
- **Test 13:** Review panel displays detected items with category, original, and placeholder; sends redacted on Enter.
- **Test 14:** Un-redacting a single item transmits only that value over the wire while remaining items stay redacted; displays restored response in DOM.
- **Test 15:** User cancel (Esc or button) sends nothing over the wire, shows warning notice, and leaves chat UI usable.
- **Test 16:** Review timeout fails closed: blocks wire transmission, shows notice, and leaves chat UI usable.
- **Test 17:** Closed Shadow DOM isolation guarantee: panel contents and raw values are completely unreachable from page JS (`shadowRoot === null`).
- **Test 18:** Send as-is action displays warning confirmation modal and transmits plain text if confirmed.
- **Test 19:** Skipped custom rule forces review panel with warning, cancelling fails closed and blocks wire request.
- **Test 20:** "My sensitive terms" in Options: matches names, employers, projects, places with possessives and last-name alone variants, leaving zero wire leakage.
- **Test 21:** Manual redaction in review panel: user selects text in prompt preview, picks category, redacts all occurrences, enrolls sensitive term, with closed Shadow DOM isolation.

---

## 5. Open Items (Awaiting User Go-Ahead & Inputs)

### 5.1 Pending Live Site Data
- **Real-Site Verification (ChatGPT & Claude):** Adapters' request field paths were written from baseline assumptions. Awaiting real-site network trace results to validate or adjust paths. Do not change adapters until then.
- **Gemini Adapter:** To be built from captured real requests, not from memory.
