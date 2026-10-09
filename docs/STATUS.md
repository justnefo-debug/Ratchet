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
- **Mechanism:** The response restorer operates exclusively in the Chrome extension's `ISOLATED` world.
- **Rationale:** Streaming responses from AI endpoints are rendered into DOM nodes. The restorer uses a scoped `MutationObserver` and `TreeWalker` to detect placeholder tokens (`«TYPE_N»`) in target message containers. Mappings are queried from the background service worker, and DOM text nodes are updated in place.
- **Security Boundary:** Original PII values and cryptographic mapping keys are never injected into the page's global JavaScript scope (`window`), protecting them from malicious page scripts, analytics, or third-party trackers.

### 1.3 Mappings in Service Worker via `chrome.storage.session` Keyed by Conversation
- **Keying Scheme:** Mappings are keyed per conversation (e.g., `conv:<conversation_id>`) extracted from site URLs or assigned session identifiers.
- **Lifecycle & Storage:**
  - **Ephemeral by Default:** Stored in `chrome.storage.session`, providing in-memory performance that survives MV3 service worker idle termination and restarts, while automatically purging all mapping state when the browser session ends.
  - **Encrypted Persistence (Optional):** When enabled by user preference, mappings are persisted to `chrome.storage.local` encrypted using AES-GCM (256-bit key derived via WebCrypto API) with an explicit time-to-live (TTL) expiry setting.
- **Scope Isolation:** Avoids cross-conversation mapping collisions and ensures multi-turn conversations retain placeholder stability.

### 1.4 Fail-Closed Security Policy
- **Strict Invariant:** If any redaction failure occurs—including service worker unreachability, detection error, custom regex timeout, or validation failure—the network request is immediately aborted and cancelled.
- **User Feedback & Usability:** A clear, non-intrusive warning notice is displayed to the user explaining that the request was stopped to prevent data leakage. The chat input is preserved intact so the user does not lose typed work and the chat interface remains usable.
- **Zero Leakage Tolerance:** Prompts are never allowed to fall through to the network in an unredacted state upon system errors.

---

## 2. Stage Delivery Summary

| Stage | Milestone | Deliverables & Verified Behavior | Status |
| :--- | :--- | :--- | :--- |
| **Stage 1** | Build Setup & MV3 Manifest | Configured Vite and TypeScript build pipeline with `base: './'`. Generated unpacked Chrome MV3 manifest without external dependencies or root-relative path resolution bugs. | ✅ Complete |
| **Stage 2** | Detection, Redaction & Storage | High-speed regex detectors for structured PII (emails, phone numbers, SSNs, credit cards with Luhn validation, API keys, IP addresses, dates of birth). Guillemet placeholder format (`«TYPE_N»`). Implemented per-conversation mapping store in `chrome.storage.session`. | ✅ Complete |
| **Stage 3** | Interception, Restoration & Adapters | MAIN-world `fetch`/XHR interceptor with `postMessage` bridge. Site adapters for ChatGPT and Claude completion endpoints. Fail-closed error handling. ISOLATED-world streaming DOM restoration. Test harness with local mock chat server. Sanitized production manifest eliminating localhost permissions. | ✅ Complete |
| **Stage 4** | Settings, Persistence & ReDoS Security | Options page with custom rules editor, entity category toggles, and sensitivity threshold controls. Client-side ReDoS validator with hard timeout. Optional AES-GCM encrypted persistence in `chrome.storage.local`. Popup UI with live session stats. | ✅ Complete |
| **Stage 5** | Gazetteer & Context Rule NER | Offline, zero-network Radix-Trie gazetteer detector for names, organizations, and locations. Morphosyntactic context rules and negative filters (code identifiers, file paths). Held-out test evaluation harness and live E2E integration test. | ✅ Complete |

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
4. **Memory Profiling Audit (Fix 4 - Completed):**
   - Disclosed that the 4.46 MB figure measured by CDP `Performance.getMetrics` originated from the active web page tab context (the renderer process hosting the chat DOM and injected content script), not the service worker.
   - Measured true V8 heap and process metrics:
     - Web Page Tab JS Heap Used: ~1.4 - 1.7 MB (idle page) to 4.46 MB (during heavy conversation rendering)
     - Service Worker V8 JS Heap: ~1.5 - 2.5 MB post-NER load
     - Dedicated Extension Helper Process Working Set (OS private memory): ~35 - 50 MB
     - Combined Chrome browser memory with extension loaded: under established 50 MB extension constraint.

---

## 4. Open Roadmap Items

### 4.1 Next Milestone: Review-Before-Send Panel
- **Per-Site Setting:** "Review before sending" toggle, default: enabled.
- **MAIN-World Wrapper Hold:** Request held in flight until user confirmation or timeout expiration.
- **Timeout Security:** Enforce strict fail-closed policy (cancel wire request, display warning notice, maintain chat input usability).
- **Closed Shadow DOM Overlay:** Created by ISOLATED content script displaying detected items (`category`, `original -> placeholder`).
- **Isolation Guarantee:** Original values must never reach logs, page DOM, or page-accessible `postMessage` channels.
- **Actions:**
  - Send redacted (default, Enter key)
  - Cancel (Esc key)
  - Un-redact individual item
  - Send as-is with explicit confirmation modal
  - Ephemeral "Don't redact this again" session list
- **Playwright Test Suite:**
  - Panel rendering correct items
  - Single-item un-redact wire verification
  - Cancel wire cancellation
  - Timeout fail-closed cancellation
  - Shadow DOM closed isolation unreachable from page JS

### 4.2 Pending Live Site Data
- **Real-Site Verification (ChatGPT & Claude):** Awaiting live request traces from production sites to validate real request payload field paths before adjusting site adapters.
- **Gemini Adapter:** Pending captured network payload structure from live Gemini interface.
