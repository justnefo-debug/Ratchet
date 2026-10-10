# Ratchet Handoff Document

> **Last Updated:** October 10, 2026 2:11 PM PKT
> **Branch:** `version1`
> **Latest Commit:** b616abe feat: packaging scripts, docs, and shape-based request classification

## Done
- A1: Diagnostics section in Options page (Verified existing implementation)
- A2: Shape-based request classification (Removed guess of prompt shape, now fails closed on unconfirmed shape)
- A3: Tests with real-site fixtures (Updated tests to expect `unknown-message-shape` and `null` prompt on unconfirmed shape)
- A4: How-to-read instructions (Instructions exist in Options page UI)
- Part B: packaging (Added `package.mjs`, `demo.mjs`, `manifest.json` icons, `LICENSE`, `PRIVACY.md`, `DEMO.md`, updated `README.md`)
- `__TEST_BUILD__` checks added to production unsafe endpoints
- **U1: Icons**: Generated 16/48/128 px shield icons using playwright script.
- **U2: Verify Packaging**: Validated `npm run package` zip output and audited `dist/` network primitives (fetch, XHR, etc.). Fixed `PRIVACY.md` to accurately reflect `powerMode` backend url logic.
- **U3: README Update**: Documented ChatGPT adapter real-site verification status.
- **U4: Update HANDOFF.md**: Finalized handoff documentation.
- **Real-site Interception Fixes**:
  - `ChatGPTAdapter` now matches request by shape (`messages` array structure), not just URL path.
  - Added debug lines in MAIN world interceptor (`window.__RATCHET_DEBUG__`), tracking paths (scrubbing UUIDs) and call styles (`fetch string URL`, `fetch Request`, `XHR`).
  - Added support for various `fetch` call styles (string, `Request` object, `Blob` body) and `XHR`.
  - Added E2E Test 22 to verify unfamiliar paths, call styles, and debug line output.
- **Restoration Fixes**:
  - Fixed `restorer.ts` to be independent of class names: uses `TreeWalker` and `MutationObserver` on document body, skips inputs/textarea/ProseMirror, handles adjacent text nodes and code blocks. Debounces via `requestAnimationFrame`.
  - Fixed `storage.ts` aggressive fallback mapping logic to correctly migrate temp mapping to the real conversation ID on URL change.
  - Added Test 23 to `e2e.spec.ts` asserting restoration works on real DOM shape (split nodes, code elements, URL change via history.pushState).

## Important Note on `RATCHET_DEBUG`
Before creating the final production package (`npm run package`), `RATCHET_DEBUG` in `extension/src/content/interceptor-main.ts` is configured to read from `window.__RATCHET_DEBUG__`. It evaluates to `false` by default on production sites.

## In Progress
- Complete! All tasks for submission are done and `ratchet-v1.0.0.zip` is built.

## Next
- Submit the project.

## Blocked / Needs User
- None at this time.

## How to Build & Run Tests
```powershell
cd extension
npm run build          # production build → dist/
npm run build:test     # test build → dist-test/
npm run test           # vitest unit tests
npm run test:e2e       # playwright e2e tests (needs build:test first)
```

## Rules Reminder
- Commit after every item. Repo must build + pass at every commit.
- If same failure survives 3 attempts, stop, record in this file, move on.
- No new features, no detection tuning, no Gemini, no CWS.
- Code freeze at 7:30 PM — only docs/packaging/test-fixes after that.
- Another model will continue from this file without seeing the chat.
