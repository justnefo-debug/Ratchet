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

## 3. Current Open Items & Pending Fixes

### 3.1 Pending Fixes (Immediate Execution)
1. **Data Provenance:** Audit entry counts per category in `src/detectors/gazetteer-data.json`. Transparently document true origins (curated seed list vs. external corpora). Rewrite `NOTICE` to reflect only actually used datasets and accurate licenses.
2. **Evaluation Integrity:** Document that the initial held-out set shared names with the gazetteer. Re-run evaluation on production codebase. Introduce a dedicated secondary dataset containing out-of-vocabulary / unknown entities (rare names, small towns, boutique companies, misspellings) to measure "unknown entity recall" separately. Add CLI/parameter support for custom user prompt JSON files in `eval-ner.mjs`.
3. **Custom-Rule Timeout in Service Worker:** MV3 service workers do not support the dedicated `Worker` constructor. Verify the failure mode where slow regexes hang the service worker. Implement a rock-solid solution (offscreen document or linear-time ReDoS-safe regex subset) with automated Playwright verification.
4. **Memory Profiling Audit:** Disclose that the 4.46 MB CDP heap figure was measured on the active tab page context. Measure and document the complete extension footprint including the service worker process.

### 3.2 Known Gaps & Future Stages
1. **Real-Site Verification (ChatGPT & Claude):** Awaiting live request traces from production sites to validate real request payload field paths before adjusting site adapters.
2. **Gemini Adapter:** Pending captured network payload structure from live Gemini interface.
3. **Review-Before-Send Panel (Next Stage):**
   - Per-site "Review before sending" toggle (default: enabled).
   - MAIN-world wrapper request hold with timeout fail-closed mechanism.
   - Closed Shadow DOM overlay created by ISOLATED content script displaying detected items (`category`, `original -> placeholder`).
   - Secure memory boundary: raw values never exposed to page DOM, logs, or unprivileged messaging.
   - User actions: "Send redacted" (Enter), "Cancel" (Esc), single-item un-redact, and "Send as-is" with confirmation.
   - Comprehensive Playwright test coverage.
