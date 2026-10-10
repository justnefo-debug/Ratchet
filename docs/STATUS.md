# Ratchet Privacy Shield — Architecture Status & Roadmap

> **Current Branch:** `version1`  
> **Last Updated:** October 9, 2026  
> **Repository Context:** Browser-native MV3 privacy shield with zero Python runtime dependency.

---

## 1. Core Architecture Decisions

### 1.1 Network-Level Interception in MAIN-World Script
- **Mechanism:** Injected script running in the webpage execution context (`MAIN` world) wraps `window.fetch` and `XMLHttpRequest`.
- **Rationale:** Web-based chat interfaces (ChatGPT, Claude, Gemini) use complex virtualized and rich-text document models (ProseMirror, Lexical, React controlled inputs). Manipulating DOM inputs directly (`value`, `innerText`, `execCommand`) fails to update internal framework state, triggers infinite mutation loops, or risks submitting raw PII over the wire. Intercepting the prompt payload at the network boundary guarantees that only redacted payloads ever leave the browser.
- **Isolation:** The raw request text goes from the MAIN-world wrapper to the ISOLATED script via `window.postMessage`. Page scripts can read that channel (the page already has the typed text), and any token shared with the MAIN world is visible to the page and is not a secret. The boundary actually protects the request leaving the browser over the network, ensuring raw PII is redacted before the wire request is dispatched.

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
- **Detection Sensitivity:** `sensitivity = 'medium'` (Controls gazetteer context strictness and proper noun heuristics. Low = strictest context, lower recall/FPR; High = loose context, captures out-of-vocabulary proper noun sequences)
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
| **Stage 6** | Review-Before-Send Panel | Closed Shadow DOM overlay (`mode: 'closed'`) in ISOLATED world displaying detected items with category and original -> placeholder. Per-site toggles, timeout countdown with fail-closed cancellation, individual item un-redact, send as-is warning modal, ephemeral session exemption list, keyboard shortcuts (Enter / Esc). 20 dedicated Playwright E2E tests passing. | ✅ Complete |

---

## 3. Pending Fixes & Resolved Audits

### 3.1 Completed Fixes & Empirical Performance Audits
1. **Lexicon Provenance & Expansion (Fix 1 - Completed):**
   - Bundled Radix-Trie in `src/detectors/gazetteer-data.json` compiles to **526.5 KB (0.51 MB)**, well under the 3.0 MB budget.
   - Total Curated Entries: **13,013** across four categories:
     - First Names: 3,700 (SSA baby names + Wikidata multilingual given names + seeds)
     - Last Names: 3,673 (Census 2010 + Wikidata multilingual surnames + seeds)
     - Organizations: 2,582 (SEC EDGAR company tickers + major institutions)
     - Locations: 3,058 (GeoNames global cities > 15,000 population + tech hubs)
   - **Census Demographics Clarification:** Clarified that East Asian and Hispanic surname representation is sourced from a static CSV file (`Names_2010Census.csv`) from the US Census Bureau 2010 Surnames table, utilizing the demographic columns `pctapi` (Percent Asian / Pacific Islander) and `pcthispanic` (Percent Hispanic), NOT from an online "Census API".
   - **Lexicon Hygiene:** Pruned Tsarist Russian nobility transliterations (`Makinsky`, `Talishinski`, `Erivansky`, `Ziyadkhanov`, `Shikhlinski`, `Kangarli`) that leaked into Wikidata regional queries.
2. **Honest Evaluation & Separated Recall Metrics (Fix 2 - Completed):**
   - Separated structured PII (>98% deterministic recall via regex and checksums) from unstructured named entity detection.
   - **Primary Held-Out Test Set (88 Prompts, 214 Gold Entities, 98.6% vocabulary overlap):**
     - Low Sensitivity: Recall 84.6% | Precision 91.0% | F1 87.7%
     - Medium Sensitivity (Default): Recall 92.1% | Precision 84.2% | F1 87.9%
     - High Sensitivity: Recall 92.1% | Precision 82.4% | F1 87.0%
   - **Unknown / Out-of-Vocabulary Entities (34 Prompts, 34 Entities, 0% gazetteer overlap):**
     - Low Sensitivity: Recall 2.9%
     - Medium Sensitivity: Recall 2.9%
     - High Sensitivity: Recall 32.4% (proper noun multi-word sequence heuristics)
   - **False Positive Rates on Ordinary Prose:**
     - *Tuning Benchmark (40 ordinary prompts across 5 genres):* 0.0% FPR across Low, Medium, and High sensitivity after enforcing title/preposition context requirements on ambiguous dictionary words (`mark`, `grace`, `target`, `visa`, `reading`, etc.).
     - *Fresh Held-Out Benchmark (25 untuned prompts across 6 genres: school assignments, customer support, travel plans, sports, health-neutral how-to, job ads):*
       - Low Sensitivity: **4.0% FPR** (1 / 25 prompts flagged: `brand` in J2)
       - Medium Sensitivity: **12.0% FPR** (3 / 25 prompts flagged: `author` in S3, `brand` in J2, `junior` in J5)
       - High Sensitivity: **16.0% FPR** (4 / 25 prompts flagged: + `American Industrial Revolution` in S1)
3. **Custom-Rule Safety & Chunked Scanning (Fix 3 - Completed):**
   - Linear-time ReDoS subset enforced: no nested quantifiers, repeated alternations, or overlapping unbounded quantifiers.
   - Maximum pattern length capped at 200 characters (`MAX_REGEX_PATTERN_LENGTH = 200`).
   - Quantifier upper bounds capped at 1,000 characters (`MAX_QUANTIFIER_BOUND = 1000`).
   - Inputs are scanned in overlapping chunks (`SCAN_CHUNK_SIZE = 10000`, `SCAN_CHUNK_OVERLAP = 1000`), guaranteeing that matches up to 1,000 characters spanning chunk boundaries are captured without memory spikes.
   - Tested and verified on 50,000-character prompts with matches at the very end and spanning chunk boundaries.
4. **Memory Profiling Audit & Process Breakdown (Fix 4 - Completed):**
   - V8 JS Heap (measured via CDP `Performance.getMetrics`): ~4.48 MB maximum in the active web page tab context (renderer process), and ~1.5 - 2.5 MB in the extension's background service worker. The "5 MB" figure refers to JS heap memory only.
   - Working Set (measured via OS Task Manager / Process memory): The background service worker consumes approximately 35 to 50 MB of total private OS memory.
   - True process-isolated memory measurements:

| Process Context | Measured JS Heap | Working Set (Private OS Memory) | Role / Lifecycle |
| :--- | :---: | :---: | :--- |
| **Web Page Tab (Renderer Process)** | ~1.4 – 1.7 MB (idle page) to ~4.48 MB (heavy conversation) | ~80 – 120 MB | Hosts target chat DOM, user interactions, injected content script, and closed Shadow DOM review overlay. |
| **Extension Background Service Worker** | ~1.5 – 2.5 MB (post-NER load, 526.5 KB compiled Trie) | ~35 – 50 MB | Coordinates detection, manages conversation mappings in `chrome.storage.session`, terminates when idle. |
| **Total Extension Overhead** | < 5.0 MB V8 Heap | Up to ~50 MB | Fully browser-native MV3; zero background daemon or Python runtime. |

---

## 4. Stage 6: Review-Before-Send Architecture & Verification

### 4.1 Security & Isolation Architecture
- **Closed Shadow DOM Overlay:** Created directly on `document.documentElement` by the `ISOLATED` world script using `host.attachShadow({ mode: 'closed' })`. Page scripts querying `host.shadowRoot` receive strictly `null`, and `host.innerText` / `host.innerHTML` are empty.
- **Zero Raw PII Exposure (Outside the Browser):**
  - Raw PII is never emitted to console logs.
  - The raw request text is sent over `window.postMessage` from `RATCHET_MAIN` to `RATCHET_ISOLATED` for redaction. Page scripts can read this channel, but they already possess the typed text.
  - The returned response over `window.postMessage` to `RATCHET_MAIN` contains only the final transformed text destined for the wire.
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
