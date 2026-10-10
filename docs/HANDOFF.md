# Ratchet Handoff Document

> **Last Updated:** October 10, 2026 1:50 PM PKT
> **Branch:** `version1`

## Done
_(none yet — starting now)_

## In Progress
- Reading codebase, creating plan

## Next
- A1: Diagnostics section in Options page
- A2: Shape-based request classification
- A3: Tests with real-site fixtures
- A4: How-to-read instructions
- Then Part B: packaging

## Blocked / Needs User
- Real Diagnostics output from chatgpt.com needed to confirm exact message shape

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
