# 🛡️ Ratchet — 9-Week Full Production Build Plan

> **Goal**: A complete, production-grade privacy shield web app + Chrome extension — with the exact UI from the reference designs.

---

## Project Overview / Tech Stack
**Tech Stack**: React, Vite, TypeScript, Python, Flask, spaCy. 
**Added for Document Support**: PyMuPDF, Tesseract (pytesseract), python-docx, openpyxl, python-pptx, pandas, striprtf, odfpy.

## Key Technical Decisions
| Decision | Rationale |
|---|---|
| PDF redaction method | true redaction (PyMuPDF), not overlay boxes |
| Unsupported or unreadable files | block by default (fail safe) |

## Success Metrics
| Metric | Target |
|---|---|
| Document leak rate | 0 originals remaining in cleaned output |
| 20-page text document scan time | < 5 seconds |

## Risks & Mitigations
| Risk | Severity | Mitigation |
|---|---|---|
| Fake redaction (black box over copyable text) | High | True redaction plus leak test on every output |
| Hidden data in metadata, comments, hidden sheets | High | Dedicated metadata cleaner plus leak test |
| OCR mistakes miss a name | Medium | Mark OCR text low-confidence and default to redact |
| Rebuilt file looks broken | Medium | Text-only fallback (Option B) |
| Large files freeze the browser | Medium | Background worker and chunking |
| Unsupported file silently sent through | High | Block by default and warn the user |

---

## 🎨 Frontend Design Analysis

Based on the reference images, here's the exact UI specification:

### Logo & Branding
- **Logo**: Black samurai warrior silhouette with katana — used as the app icon
- **App Name**: "Ratchet" in bold serif/display font
- **Tagline**: "Privacy that only tightens" in muted grey
- **Badge**: "Runs on this device" pill button (top-right) with a processing/shield icon

### Layout Structure
```
┌──────────────────────────────────────────────────────────────┐
│  [Logo] Ratchet  "Privacy that only tightens"   [Runs on..] │
├──────────────────────────────────────────────────────────────┤
│  ① Redact  |  ② Restore  |  ③ Metrics  |  ④ Changelog      │
├────────────────────────────┬─────────────────────────────────┤
│  📋 Paste your text        │  ✅ Safe version to send        │
│                            │                                 │
│  Hi, my name is [M.Nafees] │  Hi, my name is [PERSON_1]     │
│  reach me at [email]       │  reach me at [EMAIL_1]          │
│  CNIC is [42201-...]       │  CNIC is [CNIC_1]              │
│  API key [sk-7f3a...]      │  API key [API_KEY_1]           │
├────────────────────────────┴─────────────────────────────────┤
│  🛡️ 5 items found, all hidden              [Copy safe text] │
├──────────────────────────────────────────────────────────────┤
│  ☑ TYPE     │ ORIGINAL VALUE     │ → │ PLACEHOLDER │ CONF.  │
│  ☑ Name     │ M.Nafees           │ → │ PERSON_1    │ 98%    │
│  ☑ Email    │ nafees@example.com │ → │ EMAIL_1     │ 99%    │
│  ☑ CNIC     │ 42201-1234567-1   │ → │ CNIC_1      │ 97%    │
│  ☑ API key  │ sk-7f3a9e8c4d...  │ → │ API_KEY_1   │ 96%    │
└──────────────────────────────────────────────────────────────┘
```

### Color System (Extracted from Designs)

| Element | Dark Mode | Light Mode |
|---|---|---|
| **Background** | `#1a1a2e` (deep navy-black) | `#ffffff` (white) |
| **Surface/Cards** | `#16213e` (dark blue-grey) | `#f8f9fa` (light grey) |
| **Card Borders** | `#2a2a4a` (subtle purple-grey) | `#e2e8f0` (light border) |
| **Text Primary** | `#e2e8f0` (off-white) | `#1a202c` (near-black) |
| **Text Secondary** | `#94a3b8` (muted grey) | `#64748b` (grey) |
| **Accent / Active Tab** | `#e53e3e` (red) | `#e53e3e` (red) |
| **Name badge** | `#805ad5` (purple) | `#805ad5` (purple) |
| **Email badge** | `#3182ce` (blue) | `#3182ce` (blue) |
| **CNIC badge** | `#dd6b20` (orange) | `#dd6b20` (orange) |
| **API Key badge** | `#e53e3e` (red) | `#e53e3e` (red) |
| **Placeholder badge** | `#2d3748` bg + colored text | `#edf2f7` bg + colored text |
| **Checkboxes** | Red filled `#e53e3e` | Red filled `#e53e3e` |
| **Copy button** | Red pill `#e53e3e` white text | Red pill `#e53e3e` white text |
| **"Runs on device" badge** | Red outline, red text | Red outline, red text |

### Entity Type Color Mapping

| Entity Type | Badge Color | Icon |
|---|---|---|
| **Name / Person** | Purple `#805ad5` | 👤 Person icon |
| **Email** | Blue `#3182ce` | ✉️ Mail icon |
| **CNIC / ID** | Orange `#dd6b20` | 🪪 ID card icon |
| **API Key** | Red `#e53e3e` | 🔑 Key icon |
| **Phone** | Green `#38a169` | 📞 Phone icon |
| **Credit Card** | Pink `#d53f8c` | 💳 Card icon |
| **Address** | Teal `#319795` | 📍 Location icon |
| **SSN** | Amber `#d69e2e` | 🔒 Lock icon |

### Typography
- **App title**: Bold, ~28px, serif or display weight
- **Tagline**: Regular, ~14px, muted color
- **Tab labels**: Medium, ~15px
- **Section headings**: Semi-bold, ~18px, with icon prefix
- **Body text in panels**: Regular, ~14px, monospace for values
- **Table headers**: Uppercase, ~12px, letter-spacing, muted
- **Badges/pills**: Bold, ~12px, rounded-full, padding 4px 12px
- **Confidence**: Regular, ~14px

### Key UI Components
1. **Inline entity highlights** — colored pill badges embedded within flowing text
2. **Side-by-side panels** — "Paste your text" (left) / "Safe version to send" (right)
3. **Entity summary table** — checkbox, icon, type badge, original value, arrow, placeholder badge, confidence %
4. **Status bar** — "X items found, all hidden" with shield icon
5. **Copy safe text button** — red pill, top-right of status bar
6. **Tab navigation** — numbered circles (①②③④) with red underline on active
7. **Dark/Light mode toggle** — theme switcher

---

## 📐 Full Project Architecture

```mermaid
graph TB
    subgraph "Web App (React + Vite + TypeScript)"
        A["App Shell"] --> B["Header (Logo + Tagline + Badge)"]
        A --> C["Tab Navigation"]
        C --> D["Tab 1: Redact"]
        C --> E["Tab 2: Restore"]
        C --> F["Tab 3: Metrics"]
        C --> G["Tab 4: Changelog"]
        D --> H["Input Panel (Paste your text)"]
        D --> I["Output Panel (Safe version)"]
        D --> J["Entity Summary Table"]
        D --> K["Status Bar + Copy Button"]
        A --> L["Theme Toggle (Dark/Light)"]
    end

    subgraph "Chrome Extension"
        M["Content Script"] --> N["Prompt Interceptor"]
        M --> O["Response Restorer"]
        M --> P["Review Overlay"]
        Q["Popup"] --> R["Quick Stats"]
        S["Options"] --> T["Settings Page"]
    end

    subgraph "Core Engine (Python)"
        U["Flask API Server"] --> V["Detection Pipeline"]
        V --> W["Regex Detector"]
        V --> X["NER Detector (spaCy)"]
        V --> Y["Custom Rules Detector"]
        U --> Z["Redaction Engine"]
        U --> AA["Restoration Engine"]
        Z --> AB["Encrypted Mapping Store"]
    end

    H --> U
    N --> U
```

### Document Pipeline Architecture

```mermaid
graph TB
    FileUpload[File Upload] --> TypeChecker[Type Checker]
    TypeChecker --> PDFHandler[PDF Handler]
    TypeChecker --> WordHandler[Word Handler]
    TypeChecker --> ExcelHandler[Excel Handler]
    TypeChecker --> OtherHandlers[Other Handlers]
    PDFHandler --> OCR[OCR if scanned]
    OCR --> TextExtraction[Text Extraction]
    PDFHandler --> TextExtraction
    WordHandler --> TextExtraction
    ExcelHandler --> TextExtraction
    OtherHandlers --> TextExtraction
    TextExtraction --> Detectors[Existing 3 Detectors]
    Detectors --> RedactionEngine[Redaction Engine]
    RedactionEngine --> Rebuild[Rebuild Cleaned File + Strip Metadata]
    RedactionEngine --> MappingStore[Mapping Store]
    Rebuild --> CleanedFile[Cleaned File Sent to AI]
```

---

## 📅 Day 1 (Oct 4) — Complete Core Backend Engine

> **12–14 hours | All detection, redaction, restoration, encrypted storage, API**

### Morning (4h) — Detection Pipeline

- [ ] **Repo & project setup** — monorepo structure:
  ```
  ratchet/
  ├── packages/core/documents/   # File handlers (pdf, docx, xlsx, etc.)
  ├── backend/
  │   ├── detectors/
  │   │   ├── __init__.py
  │   │   ├── regex_detector.py
  │   │   ├── ner_detector.py
  │   │   └── custom_rules.py
  │   ├── core/
  │   │   ├── engine.py
  │   │   ├── redactor.py
  │   │   ├── restorer.py
  │   │   ├── mapping_store.py
  │   │   └── models.py
  │   ├── config/
  │   │   ├── default_rules.json
  │   │   └── settings.py
  │   ├── app.py
  │   ├── requirements.txt
  │   └── tests/
  ├── frontend/              # React + Vite app
  ├── extension/             # Chrome extension
  ├── Context/               # Design reference images + logo
  └── README.md
  ```
- [ ] **`regex_detector.py`** — Full pattern library:
  - Emails, phone numbers (international), credit cards (Luhn), SSNs
  - CNIC numbers (Pakistani national ID: `XXXXX-XXXXXXX-X`)
  - IPv4, IPv6, MAC addresses
  - API keys (AWS `AKIA...`, GitHub `ghp_...`, Slack `xoxb-...`, generic `sk-...`)
  - URLs with credentials, dates of birth
  - Each returns: `type`, `value`, `start`, `end`, `confidence`
- [ ] **`ner_detector.py`** — spaCy `en_core_web_sm`:
  - PERSON, ORG, GPE, LOC, DATE, MONEY, NORP
  - Confidence threshold from config
- [ ] **`custom_rules.py`** — keyword, regex, glob rules from JSON config

### Afternoon (4h) — Redaction, Restoration, Storage

- [ ] **`engine.py`** — Pipeline: run all detectors → merge → deduplicate → score
- [ ] **`redactor.py`** — Placeholder generation (`[PERSON_1]`, `[EMAIL_1]`, etc.), consistent numbering, utility preservation
- [ ] **`mapping_store.py`** — AES-256 encrypted session store with auto-expiry
- [ ] **`restorer.py`** — Exact + fuzzy matching, handles AI-modified placeholders

### Evening (4h) — API Server & Testing

- [ ] **`app.py`** — Flask API:
  ```
  POST /api/detect    → entities only
  POST /api/redact    → redacted text + entities + session
  POST /api/restore   → restored text
  POST /api/rules     → CRUD custom rules
  GET  /api/sessions  → list sessions
  GET  /api/health    → status
  ```
- [ ] 30+ test cases covering all detectors + round-trip
- [ ] Verify via curl

#### ✅ Day 1 Done When
Full redact → restore round-trip works via API with encrypted storage.

---

## 📅 Day 2 (Oct 5) — Frontend Web App (Redact Tab + Theme System)

> **12–14 hours | The main web app UI matching the reference designs exactly**

### Morning (4h) — Project Setup & Design System

- [ ] **Initialize React + Vite + TypeScript** project in `frontend/`
- [ ] **Design system / CSS variables** — full dark + light mode tokens matching the color palette above
- [ ] **Theme toggle** — dark/light mode with `prefers-color-scheme` detection
- [ ] **Google Fonts**: Inter (body) + display font for title
- [ ] **Component library setup**:
  - `Badge` — colored pill (Name=purple, Email=blue, etc.)
  - `EntityHighlight` — inline highlighted text within flowing paragraph
  - `IconButton`, `PillButton`
  - `Card` — surface container with border

### Afternoon (5h) — Redact Tab (Main Screen)

- [ ] **Header component**:
  - Samurai logo (from `Context/logo.jfif`) left-aligned
  - "Ratchet" title + "Privacy that only tightens" tagline
  - "Runs on this device" badge pill (top-right, red outline)
  - Dark/light mode toggle button
- [ ] **Tab navigation**:
  - 4 tabs: ① Redact | ② Restore | ③ Metrics | ④ Changelog
  - Numbered red circles, red underline on active tab
- [ ] **"Paste your text" panel** (left):
  - Editable textarea/contenteditable
  - Real-time entity detection as user types (debounced 300ms)
  - Detected entities shown as **inline colored badges** within the text
  - Color matches entity type (purple for names, blue for emails, etc.)
- [ ] **"Safe version to send" panel** (right):
  - Read-only mirror of input with placeholders replacing entities
  - Placeholders shown as **dark badges** with entity label (`PERSON_1`, `EMAIL_1`)
  - Updates in real-time as left panel changes
- [ ] **Side-by-side layout** — responsive, equal width panels

### Evening (3h) — Entity Summary Table + Status Bar

- [ ] **Status bar**:
  - Shield icon + "**X items** found, all hidden" text
  - "Copy safe text" red pill button (copies redacted text to clipboard)
- [ ] **Entity table**:
  - Columns: Checkbox | Icon | Type (colored badge) | Original Value | → arrow | Placeholder (badge) | Confidence %
  - Each row has a red checkbox (toggle redaction on/off per entity)
  - Unchecking = whitelisting that entity (un-redact)
  - Type icons: person, mail, ID card, key, phone, etc.
  - Confidence as percentage text
- [ ] **Connect to backend API** — real API calls to `/api/redact`
- [ ] **Copy to clipboard** functionality

#### ✅ Day 2 Done When
- Web app looks pixel-perfect matching both dark and light mode reference images
- Pasting text → entities detected and highlighted in real-time
- Safe version panel shows placeholders
- Entity table fully interactive (checkbox toggle)
- Dark/light mode toggle works

---

## 📅 Day 3 (Oct 6) — Remaining Tabs + Chrome Extension

> **12–14 hours | Restore, Metrics, Changelog tabs + working Chrome extension**

### Morning (4h) — Restore, Metrics, Changelog Tabs

- [ ] **Tab 2: Restore**
  - Input panel: paste AI response text containing placeholders
  - Select session from dropdown (list of recent sessions)
  - Output panel: restored text with originals highlighted
  - "Copy restored text" button
  - Entity table showing: placeholder → original value
- [ ] **Tab 3: Metrics**
  - Dashboard with stats cards:
    - Total entities detected (all time)
    - Total entities redacted
    - Most common entity types (bar chart)
    - Detection accuracy / confidence distribution
    - Sessions count
  - Simple charts using vanilla CSS or lightweight chart library
- [ ] **Tab 4: Changelog**
  - Version history with dates
  - Feature additions, bug fixes
  - Static content for now, can be dynamic later

### Afternoon (5h) — Chrome Extension

- [ ] **Extension scaffolding** (Manifest V3, TypeScript + Vite):
  ```
  extension/
  ├── src/
  │   ├── content/
  │   │   ├── interceptor.ts
  │   │   ├── restorer.ts
  │   │   ├── platforms/
  │   │   │   ├── chatgpt.ts
  │   │   │   ├── claude.ts
  │   │   │   └── gemini.ts
  │   │   └── index.ts
  │   ├── background/service-worker.ts
  │   ├── popup/popup.html + popup.ts + popup.css
  │   ├── shared/api-client.ts + types.ts
  │   └── assets/icons/
  ├── manifest.json
  └── vite.config.ts
  ```
- [ ] **Content scripts** for ChatGPT, Claude, Gemini:
  - Intercept prompt submission → call `/api/redact` → replace text
  - MutationObserver on responses → detect placeholders → call `/api/restore`
  - Handle streaming responses
- [ ] **Popup** — mini version of the dashboard:
  - Shield status, per-site toggle, session stats, sensitivity slider

### Evening (3h) — Extension Testing & Integration

- [ ] Load extension in Chrome dev mode
- [ ] Test interception on ChatGPT, Claude, Gemini
- [ ] Test response restoration
- [ ] Fix platform-specific DOM quirks

#### ✅ Day 3 Done When
- All 4 web app tabs fully functional
- Chrome extension intercepts and restores on all 3 AI platforms
- Popup shows live stats

---

## 📅 Day 4 (Oct 7) — Custom Rules UI, Settings, Contextual Fallbacks

> **12–14 hours | Full settings, user-defined rules, smart fallbacks**

### Morning (5h) — Settings & Custom Rules

- [ ] **Settings panel** (accessible from web app or extension options):
  - Default sensitivity level (Low/Medium/High)
  - Per-entity-type toggles
  - Auto-redact vs always-review
  - Session timeout config
  - Placeholder format customization
- [ ] **Custom rules editor**:
  - Add/edit/delete rules (keyword, regex, glob)
  - Live test: type sample text → see if rule matches
  - Import/export rules as JSON
  - Pre-built templates (medical, legal, financial)
- [ ] **Site management**: allowlist/blocklist for extension

### Afternoon (4h) — Contextual Fallbacks & Learning

- [ ] **Confidence-based behavior**:
  - High (>0.9): auto-redact
  - Medium (0.7–0.9): redact + flag as uncertain (dashed border in review)
  - Low (0.5–0.7): highlight only, ask user
  - Below 0.5: ignore
- [ ] **Local learning loop** (Kaizen):
  - Track user approve/reject decisions
  - Adjust thresholds per entity type over time
  - Store patterns locally
- [ ] **Edge cases**:
  - Code blocks with embedded secrets
  - JSON/CSV structured data in prompts
  - Multi-line, markdown-formatted text

### Evening (3h) — Wire Everything Together

- [ ] Sync settings: web app ↔ backend ↔ extension
- [ ] Custom rules flow: create in web app → apply in extension
- [ ] Handle backend offline gracefully

#### ✅ Day 4 Done When
Custom rules editable in UI, confidence fallbacks working, learning loop tracking decisions.

---

## 📅 Phase 4: Document Support (Week 6-7)

> [!IMPORTANT]
> Without this phase, uploading a file bypasses Ratchet completely. All file handling happens locally, just like text.

Every file type gets a small "reader" that extracts text and hands it to the same three detectors (regex, NER, custom rules). After redaction, Ratchet produces either a cleaned copy of the file or cleaned text. Flow: Upload file -> check file type -> reader extracts text -> existing detectors -> redact -> cleaned file sent to AI -> reply restored.

### 4.1 Upload Interception
- [ ] Catch files chosen via the attach button (input type=file), drag-and-drop, and clipboard paste
- [ ] Hold the file until scanning finishes, then pass on the cleaned version
- [ ] Progress bar for large files
- [ ] Block unsupported file types with a warning ("Ratchet can't protect this file. Send anyway?")

### 4.2 File Type Handlers
*(code lives in packages/core/documents/; pattern: extract text -> detect -> redact -> rebuild)*

| File type | Extensions | Tool | What needs care |
|---|---|---|---|
| PDF (text) | .pdf | PyMuPDF / pdfplumber | Must truly remove text, not just draw black boxes |
| PDF (scanned) | .pdf | Tesseract OCR | Text is an image; OCR first; mistakes possible |
| Word | .docx | python-docx | A name can be split across formatting "runs" |
| Excel | .xlsx, .xls | openpyxl | Cells, hidden sheets, formulas, comments |
| CSV / TSV | .csv, .tsv | pandas / csv | Column-aware detection (column named "Email") |
| PowerPoint | .pptx | python-pptx | Slide text, speaker notes, tables |
| Plain text / Markdown | .txt, .md | built-in | Easiest case |
| JSON / XML / YAML | .json, .xml, .yaml | built-in parsers | Redact values, keep structure valid |
| Rich text / OpenDocument | .rtf, .odt, .ods | striprtf / odfpy | Convert, then handle like others |
| Images | .png, .jpg | Tesseract OCR | Warn only; detection unreliable |
| Code files | .py, .js, .env, etc. | built-in | Focus on API keys and passwords |

### 4.3 Handler Details
- [ ] PDF: detect text vs scanned (almost no text on a page = scan); use TRUE redaction (PyMuPDF apply_redactions) that deletes the underlying text, because black rectangles over copyable text are not real redaction; run OCR on scanned pages and place redaction boxes at OCR word positions; handle multi-column layouts and tables
- [ ] Word: merge split text runs before detection (e.g. "Jo"+"hn"+" Doe"); scan headers, footers, footnotes, text boxes, tables; remove comments and tracked changes
- [ ] Excel: scan all sheets including hidden ones; scan values, formulas, comments, named ranges; use column headers as hints (a column titled "SSN" is all sensitive); keep formulas working where possible; process large sheets in chunks
- [ ] CSV/JSON/XML: keep structure valid; redact by field name and by value
- [ ] PowerPoint: scan slide text, tables, notes, alt text

### 4.4 Metadata Cleaning
- [ ] Remove author, company, last-edited-by names
- [ ] Remove creation/edit dates, revision history, printer/computer names
- [ ] Remove embedded thumbnails and file paths
- [ ] Remove comments and tracked changes

### 4.5 Output Strategy (user chooses, with a sensible default per file type)
- [ ] Option A: cleaned copy (rebuilt file with placeholders; best for layout)
- [ ] Option B: cleaned text pasted into chat (more reliable, loses formatting)
- [ ] Option C: preview and approve (reuses the Phase 3 review screen)

### 4.6 Restoring Document Answers
- [ ] Store mappings under a documentId linked to the session
- [ ] Restore placeholders in the AI reply as usual
- [ ] If the AI produces a new file (summary, edited spreadsheet), intercept the download and restore placeholders inside it
- [ ] Use consistent placeholders across the whole document (John Doe is always [PERSON_1], even on page 50)

### 4.7 Safety Limits and Warnings
- [ ] Password-protected files: ask for the password locally or warn they cannot be scanned
- [ ] Macro files (.xlsm, .docm): warn or block
- [ ] Images inside documents (ID photos, screenshots): warn, or OCR with a "low confidence" label
- [ ] Handwriting: warn that it is unsupported
- [ ] Configurable file size limit (e.g. 25 MB) with a "scanning may take a while" notice
- [ ] Encrypted or corrupted files: fail safely by blocking the upload
- [ ] Always show a summary, e.g. "Found 14 items in 3 pages. 1 image could not be scanned."

### 4.8 Performance
- [ ] Run in a background worker so the browser does not freeze
- [ ] Chunk large files, scan each chunk, combine results
- [ ] Cache results so re-uploading the same file is instant
- [ ] Target: under 5 seconds for a 20-page text document

### 4.9 Testing
- [ ] Create sample files for each format with known private data planted inside
- [ ] LEAK TEST: after redaction, extract all text from the output and confirm no original values remain, including metadata and hidden sheets
- [ ] Test odd files: split runs, merged cells, rotated pages, huge files
- [ ] Confirm cleaned files still open in Word, Excel, and Acrobat

### Suggested Build Order
1. TXT, CSV, JSON
2. DOCX
3. XLSX
4. PDF (text) with true redaction
5. PPTX
6. PDF (scanned) and images with OCR

---

## 📅 Phase 5 (Week 8) — Security, Performance & Polish

> **12–14 hours | Hardened, fast, thoroughly tested**

### Morning (4h) — Security

- [ ] Verify AES-256 encrypted mapping store
- [ ] Document handling must also pass the zero-network-call and memory-clearing requirements
- [ ] Audit: zero PII in logs, storage, messages
- [ ] Input sanitization, XSS prevention in restored text
- [ ] Regex ReDoS testing + timeouts
- [ ] CSP headers on API

### Afternoon (4h) — Performance

- [ ] Detection pipeline < 100ms for 500-word prompt
- [ ] Pre-compile regex, load spaCy once, parallel detection
- [ ] Debounced real-time detection in frontend (300ms)
- [ ] Lazy-load extension components
- [ ] Profile memory: extension < 30MB, web app < 50MB

### Evening (4h) — Testing

- [ ] 50+ backend unit tests
- [ ] Frontend component tests
- [ ] Manual E2E: web app + extension on ChatGPT, Claude, Gemini
- [ ] Edge case scenarios: real emails, code with secrets, financial reports
- [ ] Cross-browser: Chrome (primary), Edge

#### ✅ Phase 5 Done When
Zero PII leaks, sub-100ms detection, all tests green, smooth on all platforms.

---

## 📅 Phase 6 (Week 9) — Demo & Deployment

> **10–12 hours | Production-ready delivery**

### Morning (4h) — Documentation

- [ ] **README.md** — full docs with architecture diagram, screenshots, setup guide
- [ ] API reference documentation
- [ ] Custom rules docs with examples
- [ ] In-app onboarding tooltips

### Afternoon (4h) — Demo

- [ ] Record 3–5 min demo video showing full flow
- [ ] Screenshots of dark + light mode for README
- [ ] Presentation slides if needed

### Evening (2h) — Final Ship

- [ ] Code cleanup, remove debug logs
- [ ] Final E2E test on clean Chrome profile
- [ ] Git tag `v1.0.0`, push to GitHub
- [ ] Submit all links

---

## 📊 Complete Feature Checklist

| Feature | Day |
|---|---|
| Regex detection (emails, phones, cards, SSNs, CNICs, API keys) | 1 |
| NER detection (names, orgs, locations, dates, money) | 1 |
| Custom rules engine (keyword, regex, glob) | 1 |
| Encrypted mapping store (AES-256) | 1 |
| Redaction + restoration with fuzzy matching | 1 |
| Flask API with full endpoints | 1 |
| Web app: Redact tab with side-by-side panels | 2 |
| Inline entity highlighting (colored badges in text) | 2 |
| Entity summary table with checkboxes + confidence | 2 |
| Dark/light mode matching reference designs | 2 |
| Samurai logo integration | 2 |
| Restore tab, Metrics tab, Changelog tab | 3 |
| Chrome extension (ChatGPT, Claude, Gemini) | 3 |
| Extension popup dashboard | 3 |
| Custom rules editor UI | 4 |
| Settings page (sensitivity, per-entity toggles) | 4 |
| Contextual fallbacks (confidence-based) | 4 |
| Local learning loop (Kaizen) | 4 |
| Security hardening | 5 |
| Performance optimization (< 100ms) | 5 |
| 50+ tests | 5 |
| Documentation + demo video | 6 |

---

## Timeline
- **Phase 1**: Weeks 1-2
- **Phase 2**: Weeks 3-4
- **Phase 3**: Week 5
- **Phase 4 (Document Support)**: Weeks 6-7
- **Phase 5 (Security, Performance, Polish)**: Week 8
- **Phase 6 (Demo & Deployment)**: Week 9

## Immediate Next Steps
1. Initialize the monorepo and React frontend.
2. Build the core backend detection pipeline.
3. Integrate the UI and connect to the API.
> [!TIP]
> Document support begins after Phase 3.

---

## 🚀 Ready to Build — Phase 1 Starts Now!
