# Ratchet Privacy Shield

Ratchet is a privacy-preserving browser extension that automatically detects and redacts sensitive data (PII, PHI, secrets) from your prompts before they leave your browser to AI chatbots like ChatGPT and Claude.

## Features
- **Network-Level Interception**: Stops sensitive data at the `window.fetch` / `XMLHttpRequest` level.
- **100% Local & Offline**: Uses an offline Radix-Trie for Named Entity Recognition. Zero external API calls.
- **DOM Restoration**: The extension seamlessly replaces placeholders back with the original sensitive terms in the AI's response so your reading experience is completely unaffected.
- **Strict Fail-Closed Security**: If anything goes wrong, Ratchet blocks the request rather than leaking your data.
- **Review-Before-Send UI**: An isolated Shadow DOM modal lets you individually un-redact false positives or send data "as-is" after a warning.

## Building and Running
1. `cd extension`
2. `npm install`
3. `npm run build` (For production) or `npm run build:test` (For local testing).
4. Load the `dist/` or `dist-test/` folder in Chrome via `chrome://extensions/` -> Load unpacked.

## Limitations (Honest Disclosure)
- **DOM Visibility**: Restored text values live directly in the page DOM so you can read them. As a result, page scripts running on the target origin (e.g., ChatGPT's frontend scripts) *can* technically read restored values once they are rendered. Client-side restoration prevents data from leaving the browser over the wire to the AI backend, but cannot conceal text in the page DOM from the page's own scripts.
- **Threat Model Scope**: While keys and persistence storage are protected from casual extraction by WebCrypto, Ratchet does not protect against an attacker with physical read access to your browser profile directory on disk, nor against malware with browser memory inspection capabilities.
- **Inherent ML Imperfection**: While structured PII (emails, SSNs) has >98% deterministic recall, unstructured entity detection (names, organizations) relies on dictionaries and heuristics. It will occasionally miss out-of-vocabulary entities or flag safe words (e.g., "brand" or "author" in certain contexts). Review the prompt before sending.
- **Unsupported Sites**: Gemini is not currently supported. On unsupported sites, Ratchet will explicitly show it is disabled.
- **Site Verification**: ChatGPT (real site, tested manually on 2026-10-10 with fake data): the review panel appears, the request body sent to chatgpt.com contains placeholders and no raw values, and the message and reply show the restored values on screen. Claude: not tested on the real site. Names, organizations and places are detected only from a built-in list.
