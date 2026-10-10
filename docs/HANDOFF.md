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

## In Progress
- Complete! All tasks for submission are done.

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
