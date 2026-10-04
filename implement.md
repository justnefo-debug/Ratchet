# 🛡️ Ratchet — Implementation Plan

> **Ratchet: Intelligent Local Privacy Shield for AI Workflows**
> Automatically detects, redacts, and restores sensitive data in real time whenever users interact with AI models or LLM applications.

---

## 📋 Project Overview

| Attribute | Detail |
|---|---|
| **Track** | Developer Tools / AI Safety & Privacy |
| **Core Concept** | Reversible redaction — detect PII, swap with placeholders, send sanitized text to AI, restore originals in the response |
| **Key Differentiator** | Everything runs **locally** — no raw data ever leaves the device |
| **Tech Stack** | Python/Rust (core engine), spaCy/ONNX (NLP/NER), TypeScript + React (UI), WebExtensions API (browser extension) |

---

## 🏗️ Architecture Overview

```mermaid
graph LR
    A["User Input<br/>(prompt with PII)"] --> B["Ratchet Core Engine"]
    B --> C["Layered Detection Pipeline"]
    C --> D["Regex Patterns"]
    C --> E["NER Model<br/>(spaCy/ONNX)"]
    C --> F["Custom User Rules"]
    D & E & F --> G["Redaction Engine<br/>(swap with placeholders)"]
    G --> H["Mapping Store<br/>(local only)"]
    G --> I["Sanitized Prompt<br/>(sent to AI)"]
    I --> J["AI Model Response<br/>(with placeholders)"]
    J --> K["Restoration Engine"]
    H --> K
    K --> L["Final Response<br/>(original data restored)"]
```

---

## 📦 Phase Breakdown

### Phase 1: Project Foundation & Core Engine (Week 1–2)

> [!IMPORTANT]
> This phase establishes the backbone — the detection and redaction pipeline that everything else depends on.

#### 1.1 Repository & Monorepo Setup
- [ ] Initialize monorepo structure:
  ```
  ratchet/
  ├── packages/
  │   ├── core/              # Python — detection & redaction engine
  │   ├── extension/         # TypeScript/React — browser extension
  │   └── shared/            # Shared types, constants, configs
  ├── models/                # Local NER model files (spaCy/ONNX)
  ├── tests/                 # Integration & E2E tests
  ├── docs/                  # Documentation
  ├── .github/               # CI/CD workflows
  ├── README.md
  ├── LICENSE
  └── pyproject.toml / package.json
  ```
- [ ] Configure linting (Ruff for Python, ESLint for TypeScript)
- [ ] Set up pre-commit hooks
- [ ] Configure CI/CD (GitHub Actions)

#### 1.2 Regex Pattern Detection Module (`packages/core/detectors/regex_detector.py`)
- [ ] Implement regex patterns for:
  - **Email addresses** — RFC 5322 compliant
  - **Phone numbers** — international formats (E.164, US, EU, etc.)
  - **Credit card numbers** — Visa, MasterCard, Amex, Discover (with Luhn validation)
  - **Social Security Numbers (SSN)**
  - **IP addresses** — IPv4 and IPv6
  - **API keys / tokens** — common formats (AWS, GitHub, Slack, etc.)
  - **URLs with credentials** — `https://user:pass@host`
  - **Dates of birth** — common formats
  - **Passport / ID numbers** — basic patterns
- [ ] Support confidence scoring per match
- [ ] Unit tests for each pattern (positive + negative cases)

#### 1.3 NER-Based Detection Module (`packages/core/detectors/ner_detector.py`)
- [ ] Integrate **spaCy** with `en_core_web_sm` or `en_core_web_trf` model
- [ ] Alternatively: integrate **ONNX Runtime** for a lightweight NER model
- [ ] Detect entity types:
  - `PERSON` — human names
  - `ORG` — organization names
  - `GPE` / `LOC` — geographical / physical addresses
  - `DATE` — dates
  - `MONEY` — financial figures
- [ ] Map NER labels → Ratchet entity categories
- [ ] Add confidence threshold configuration
- [ ] Unit tests with diverse text samples

#### 1.4 Custom User Rules Module (`packages/core/detectors/custom_rules.py`)
- [ ] Define rule schema (JSON/YAML):
  ```yaml
  rules:
    - name: "Project Codename"
      type: "keyword"
      values: ["Project Phoenix", "Operation Titan"]
      category: "INTERNAL"
    - name: "Internal Domain"
      type: "regex"
      pattern: "\\b\\w+@internal\\.corp\\.com\\b"
      category: "EMAIL"
  ```
- [ ] Load rules from local config file (`~/.ratchet/rules.yaml`)
- [ ] Support keyword match, regex match, and glob match
- [ ] Priority/ordering system for rules

#### 1.5 Redaction Engine (`packages/core/redactor.py`)
- [ ] Implement placeholder generation system:
  - `"John Doe"` → `[PERSON_1]`
  - `"jane@email.com"` → `[EMAIL_1]`
  - `"4111-1111-1111-1111"` → `[CREDIT_CARD_1]`
  - Consistent numbering across same entity types
- [ ] Build **mapping store** — a local-only, in-memory + encrypted-on-disk key-value store:
  ```python
  mapping = {
      "[PERSON_1]": "John Doe",
      "[EMAIL_1]": "jane@email.com",
      "[CREDIT_CARD_1]": "4111-1111-1111-1111"
  }
  ```
- [ ] Ensure **utility preservation** — placeholders maintain grammar and sentence structure
- [ ] Handle overlapping detections (priority resolution)
- [ ] Support nested/contextual entities

#### 1.6 Restoration Engine (`packages/core/restorer.py`)
- [ ] Reverse-map placeholders in AI response back to original values
- [ ] Handle edge cases:
  - AI rephrases or pluralizes placeholders
  - AI adds/removes placeholders
  - Partial placeholder matches
- [ ] Fuzzy matching for slightly altered placeholders
- [ ] Integration tests: redact → send → restore round-trip

---

### Phase 2: Browser Extension — UI & Integration (Week 3–4)

> [!TIP]
> The extension intercepts prompts in the browser before they're sent to AI services, applies redaction, and restores responses — all transparently.

#### 2.1 Extension Scaffolding (`packages/extension/`)
- [ ] Set up TypeScript + React project with Vite
- [ ] Configure for **WebExtensions API** (manifest v3)
- [ ] Target browsers: Chrome (primary), Firefox (secondary)
- [ ] Project structure:
  ```
  extension/
  ├── src/
  │   ├── background/        # Service worker
  │   ├── content/           # Content scripts (page injection)
  │   ├── popup/             # Extension popup UI (React)
  │   ├── options/           # Settings page (React)
  │   ├── components/        # Shared UI components
  │   └── utils/             # Helpers, API bridge to core
  ├── public/
  │   ├── manifest.json
  │   └── icons/
  └── vite.config.ts
  ```

#### 2.2 Content Script — Prompt Interception
- [ ] Detect AI chat interfaces (ChatGPT, Claude, Gemini, etc.)
- [ ] Hook into input fields / text areas before form submission
- [ ] Intercept prompt text → send to core engine for redaction
- [ ] Replace original text with redacted version before it's sent
- [ ] Support `contenteditable` divs and shadow DOM elements

#### 2.3 Content Script — Response Restoration
- [ ] Monitor AI response stream / DOM mutations
- [ ] Detect placeholders in AI responses
- [ ] Replace placeholders with original values using the mapping store
- [ ] Handle streaming responses (token-by-token restoration)

#### 2.4 Popup UI — Privacy Dashboard
- [ ] **Status indicator** — green/yellow/red shield icon
- [ ] **Redaction summary** — "5 items redacted in this session"
- [ ] **Entity breakdown** — table of redacted items by category
- [ ] **Toggle** — enable/disable Ratchet per-site
- [ ] **Quick settings** — sensitivity slider (low/medium/high)

#### 2.5 Options Page — Configuration
- [ ] **Custom rules editor** — add/edit/delete custom detection rules
- [ ] **Sensitivity settings** — per-entity-type toggles
- [ ] **Allowlist/Blocklist** — sites where Ratchet is active/disabled
- [ ] **Export/Import** settings
- [ ] **Data management** — clear local mappings, view audit log

#### 2.6 Core-Extension Bridge
- [ ] Communication layer between TypeScript extension and Python core:
  - **Option A**: Python backend as a local HTTP server (localhost)
  - **Option B**: Native messaging host (recommended for production)
  - **Option C**: WASM compilation of core logic (future)
- [ ] Define API contract:
  ```typescript
  // Request
  { action: "redact", text: string, context?: string }
  // Response
  { redactedText: string, mappingId: string, entities: Entity[] }
  
  // Request
  { action: "restore", text: string, mappingId: string }
  // Response
  { restoredText: string }
  ```

---

### Phase 3: Interactive Review & Edge Case Handling (Week 5)

> [!NOTE]
> This is what makes Ratchet truly production-ready — handling the cases where automated detection isn't enough.

#### 3.1 Interactive Review UI
- [ ] Before sending, show a **redaction preview panel**:
  - Highlighted original text with color-coded entity types
  - Each redacted item shows: original → placeholder
  - Click to **un-redact** (whitelist) specific items
  - Click to **manually redact** missed items
- [ ] Keyboard shortcuts for approve/reject/edit
- [ ] "Send as-is" vs "Send redacted" options

#### 3.2 Contextual Fallback System
- [ ] When confidence is below threshold:
  - Mark entity as "uncertain" (yellow highlight)
  - Default to redaction (err on the side of caution)
  - Log for user review
- [ ] Build a local learning loop:
  - Track user override decisions
  - Adjust future confidence thresholds per entity type
  - Store learned patterns locally (Kaizen approach)

#### 3.3 Edge Case Handling
- [ ] Multi-language support (at least English + common European languages)
- [ ] Code snippets with embedded secrets (API keys in code blocks)
- [ ] Tabular/structured data (CSV, JSON in prompts)
- [ ] Mixed format text (Markdown, HTML fragments)
- [ ] Very long prompts (chunking strategy)

---

### Phase 4: Security, Performance & Polish (Week 6)

#### 4.1 Security Hardening
- [ ] **Encrypted mapping store** — AES-256 encryption for on-disk mappings
- [ ] **Session-scoped mappings** — auto-expire after session/time
- [ ] **Memory safety** — clear sensitive data from memory after use
- [ ] **No telemetry** — zero external network calls from core engine
- [ ] **CSP compliance** — Content Security Policy for extension
- [ ] Security audit checklist

#### 4.2 Performance Optimization
- [ ] Benchmark detection pipeline (target: <100ms for typical prompts)
- [ ] Optimize regex compilation (pre-compile patterns)
- [ ] Lazy-load NER model (load on first use, keep in memory)
- [ ] Profile memory usage — target <50MB for extension
- [ ] Consider Rust rewrite for hot paths if Python is bottleneck

#### 4.3 Testing & Quality
- [ ] Unit tests: ≥90% coverage for core engine
- [ ] Integration tests: full redact → AI → restore round-trips
- [ ] E2E tests: Playwright tests for extension on ChatGPT, Claude
- [ ] Fuzz testing for regex patterns (ReDoS prevention)
- [ ] Manual QA on Chrome & Firefox

#### 4.4 Documentation & Packaging
- [ ] README with setup, usage, architecture diagrams
- [ ] Contributing guide
- [ ] User guide with screenshots
- [ ] Chrome Web Store listing preparation
- [ ] Demo video recording

---

### Phase 5: Demo & Deployment (Week 7)

#### 5.1 Demo Environment
- [ ] Record demo video showing:
  1. User types prompt with PII into ChatGPT
  2. Ratchet highlights detected entities
  3. User reviews and sends redacted prompt
  4. AI responds with placeholders
  5. Ratchet restores originals in the response
- [ ] Prepare live demo with test data

#### 5.2 Deployment
- [ ] Publish to Chrome Web Store (unlisted initially)
- [ ] GitHub release with pre-built extension package
- [ ] Docker container for core engine (optional server mode)
- [ ] Landing page at project URL

---

## 🎯 Key Technical Decisions

| Decision | Recommendation | Rationale |
|---|---|---|
| **Core-to-Extension Communication** | Native Messaging Host | Most secure; no open ports; Chrome-native API |
| **NER Model** | spaCy `en_core_web_sm` | Good balance of accuracy vs. size (~12MB); runs locally |
| **Mapping Storage** | SQLite + AES-256 | Encrypted, lightweight, no server needed |
| **Placeholder Format** | `[TYPE_N]` (e.g., `[PERSON_1]`) | Clear, structured, unlikely to appear in natural text |
| **Extension Manifest** | Manifest V3 | Future-proof; required for Chrome Web Store |
| **Build Tool** | Vite | Fast builds, good TypeScript/React support |

---

## 📊 Success Metrics

| Metric | Target |
|---|---|
| Detection Accuracy (PII recall) | ≥ 95% |
| False Positive Rate | ≤ 5% |
| Redaction Latency | < 100ms per prompt |
| Restoration Accuracy | 100% for exact placeholders |
| Extension Memory Usage | < 50MB |
| Supported AI Platforms | ChatGPT, Claude, Gemini (minimum) |

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| NER model too large for extension | High | Use ONNX quantized model; lazy loading |
| AI rephrases placeholders | Medium | Fuzzy matching in restoration; user review |
| Site DOM changes break interception | Medium | Modular content scripts; MutationObserver fallbacks |
| Regex ReDoS attacks | High | Fuzz test all patterns; use RE2-compatible syntax |
| User overrides weaken security | Low | Clear warnings; audit log; default to redact |

---

## 🚀 Immediate Next Steps

1. **Initialize the monorepo** with the folder structure above
2. **Build `regex_detector.py`** — start with email, phone, credit card patterns
3. **Build `ner_detector.py`** — integrate spaCy with basic entity detection
4. **Build `redactor.py`** — implement placeholder generation and mapping store
5. **Build `restorer.py`** — implement reverse-mapping logic
6. **Scaffold the browser extension** — manifest v3, content script, popup UI

> [!TIP]
> Would you like me to proceed with implementing Phase 1? I can start building the core engine right away.
