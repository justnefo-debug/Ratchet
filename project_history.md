# 🛡️ Ratchet — Project History & Progress Log

## Overview
Ratchet is a production-grade local privacy shield and web application designed to intercept, redact, and securely restore sensitive data (PII) before it is sent to AI models (like ChatGPT, Claude, and Gemini) and after it is returned. 

This file logs all completed development work up to the full realization of the implementation plan.

---

## 📅 Completed Phases

### 1. Core AI Engine & NLP Pipeline (Backend)
- **Regex Detectors**: Engineered high-confidence pattern matchers (`regex_detector.py`) for precise detection of:
  - Emails, International Phone Numbers, API Keys (AWS, GitHub, Slack, OpenAI)
  - Credit Cards (validated with Luhn algorithm check)
  - Pakistani CNICs, IP Addresses, MAC Addresses
- **NER NLP Detectors**: Integrated local `spaCy` (`en_core_web_sm`) in `ner_detector.py` to intelligently flag Contextual Names, Organizations, Locations, and Dates.
- **Pipeline Orchestration**: Built `engine.py` to merge Regex and NER detections, assign confidence scores, and deduplicate overlapping flags (e.g. prioritizing CNICs over generic phone numbers).
- **True Redaction Generation**: Developed `redactor.py` which dynamically generates consistent sequential placeholders (e.g., `[PERSON_1]`, `[EMAIL_1]`) based on the entity type.
- **Offline Session Vault**: Created `mapping_store.py` that utilizes AES-256 encryption to securely store the original-to-placeholder maps locally, preventing any PII leaks.
- **Fuzzy Restoration**: Built `restorer.py` that intercepts AI-modified text and precisely swaps the placeholders back for the original sensitive values securely.

### 2. Document Support & True Redaction (Phase 4)
- **PDF Handler** (`pdf_handler.py`): Leveraged `PyMuPDF` to perform **true redaction** on PDF documents. It fully destroys the underlying text string in the binary rather than simply drawing black boxes, eliminating copy-paste leaks.
- **Word Handler** (`word_handler.py`): Integrated `python-docx` to iterate over document runs, paragraphs, and nested tables, safely replacing matching text inline without destroying document formatting.
- **Excel Handler** (`excel_handler.py`): Integrated `openpyxl` to extract evaluated values from all worksheets (including hidden sheets), strictly overwriting matching cells with placeholders.
- **Metadata Scrubbing**: All handlers inherently clear out the file's properties (Authors, Last Modified By, Creation Dates, etc.) to ensure zero metadata leakage.
- **File Routing**: Created `router.py` to automatically detect the filetype and dispatch it to the correct handler.
- **Automated Validation**: Created comprehensive local test scripts (`test_documents.py` and `test_all.py`) achieving a 10/10 pass rate on text extraction, redaction, metadata cleaning, and save-as execution.

### 3. API & Frontend Integration (React + Vite)
- **Flask API API Server**: Deployed `app.py` functioning as the core bridge, exposing:
  - `POST /api/redact`: Sanitizes raw text payloads.
  - `POST /api/restore`: Re-injects PII into AI responses.
  - `POST /api/document/redact`: Consumes uploaded file Blobs (`.pdf`, `.docx`, `.xlsx`), executes the Document Router, and returns the sanitized safe file buffer as a downloadable attachment.
- **React UI**: 
  - Implemented the sleek, dark-themed "Samurai" UI. 
  - Developed the **Redact Tab** equipped with dual side-by-side panels.
  - Developed the **Restore Tab** for interacting with stored vault sessions.
  - Added **Entity Highlighting** (colored inline token badges rendering live as the user types).
- **Frontend Wiring (`engine/api.ts`)**: Replaced the original local fallback detection with full asynchronous API integration, routing both text prompts and uploaded files (via `FormData`) seamlessly to the Python backend.

---

## 🚦 Current Project Status
- **Status**: ✅ **COMPLETED**
- **Quality**: 10/10 functionality verified across local tests.
- **Next Steps**: The project is functionally complete per the 9-Week Implementation Plan. Ready for production deployment or extension packaging!
