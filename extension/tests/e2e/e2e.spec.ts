/**
 * Ratchet Privacy Shield — Comprehensive Playwright E2E Test Suite
 *
 * Runs against local MockChatServer using real Chromium persistent context
 * with the unpacked extension loaded from dist/.
 *
 * Verifies all 5 Stage 3 requirements:
 * 1. Prompt with email, phone, API key -> Server logged body contains NONE of raw values.
 * 2. Displayed response shows original values restored in DOM.
 * 3. Follow-up in same conversation -> Same entities get same placeholders.
 * 4. Kill service worker between messages -> Follow-up still restores correctly.
 * 5. Fail-closed: Unreachable worker -> Request blocked, nothing sent, notice displayed.
 */

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { MockChatServer } from '../mock-chat-server';

const PORT = 3456;
const extensionDistPath = path.resolve(__dirname, '../../dist');

test.describe('Ratchet Privacy Shield E2E Interception & Restoration', () => {
  let server: MockChatServer;
  let context: BrowserContext;
  let page: Page;
  let tempUserDataDir: string;

  test.beforeAll(async () => {
    // 1. Start mock chat server
    server = new MockChatServer(PORT);
    await server.start();

    // 2. Create isolated temporary profile directory
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-e2e-'));

    // 3. Launch persistent context with extension loaded
    context = await chromium.launchPersistentContext(tempUserDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionDistPath}`,
        `--load-extension=${extensionDistPath}`,
        '--no-sandbox',
      ],
    });

    // Wait for extension background service worker to initialize
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    expect(worker).toBeTruthy();

    page = await context.newPage();
  });

  test.afterAll(async () => {
    try {
      if (context) await context.close();
      if (server) await server.stop();
      if (tempUserDataDir && fs.existsSync(tempUserDataDir)) {
        fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── Test 1, 2, 3: Full Conversation Flow with Textarea & ContentEditable ───
  test('1, 2 & 3: Multi-turn conversation round-trip with textarea and contenteditable variants', async () => {
    const convId = 'conv-e2e-conversation';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const emailAlice = 'alice.in.wonderland@privacy.org';
    const phoneAlice = '+1-555-839-2041';
    const apiKeyAlice = 'sk-proj-abcde1234567890fghij1234567890klmno';
    const prompt1 = `Hello! My email is ${emailAlice}, contact phone is ${phoneAlice}, and key is ${apiKeyAlice}. Please echo them.`;

    // ─── Turn 1: Variant A (Textarea) ─────────────────────────────────
    await page.locator('#prompt-textarea').fill(prompt1);
    await page.locator('#send-textarea-btn').click();

    // Wait for streaming completion
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    // Requirement 1: Server logged body contains NONE of raw values
    expect(server.loggedRequests.length).toBe(1);
    const loggedBody1 = server.loggedRequests[0].body;

    expect(loggedBody1).not.toContain(emailAlice);
    expect(loggedBody1).not.toContain(phoneAlice);
    expect(loggedBody1).not.toContain(apiKeyAlice);

    expect(loggedBody1).toContain('«EMAIL_1»');
    expect(loggedBody1).toContain('«PHONE_1»');
    expect(loggedBody1).toContain('«API_KEY_1»');

    // Requirement 2: Displayed response shows original values restored
    const assistant1 = page.locator('.assistant-message').first();
    await expect(assistant1).toBeVisible();
    const domText1 = await assistant1.innerText();

    expect(domText1).toContain(emailAlice);
    expect(domText1).toContain(phoneAlice);
    expect(domText1).toContain(apiKeyAlice);
    expect(domText1).not.toContain('«EMAIL_1»');
    expect(domText1).not.toContain('«PHONE_1»');
    expect(domText1).not.toContain('«API_KEY_1»');

    // ─── Turn 2: Variant B (ContentEditable Follow-up in Same Conversation) ─
    server.clearLoggedRequests();

    const emailBob = 'bob.builder@construction.net';
    const prompt2 = `Follow-up: Email again is ${emailAlice}, phone is ${phoneAlice}, and new teammate is ${emailBob}.`;

    // Fill contenteditable
    await page.locator('#prompt-editable').click();
    await page.locator('#prompt-editable').evaluate((el, text) => {
      el.textContent = text;
    }, prompt2);
    await page.locator('#send-editable-btn').click();

    // Wait for streaming completion
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    // Requirement 3: Same entities get SAME placeholders, new entity gets next placeholder
    expect(server.loggedRequests.length).toBe(1);
    const loggedBody2 = server.loggedRequests[0].body;

    expect(loggedBody2).not.toContain(emailAlice);
    expect(loggedBody2).not.toContain(phoneAlice);
    expect(loggedBody2).not.toContain(emailBob);

    // Alice keeps EMAIL_1 and PHONE_1
    expect(loggedBody2).toContain('«EMAIL_1»');
    expect(loggedBody2).toContain('«PHONE_1»');
    // Bob receives EMAIL_2
    expect(loggedBody2).toContain('«EMAIL_2»');

    // Displayed second response shows both Alice and Bob restored
    const assistant2 = page.locator('.assistant-message').nth(1);
    await expect(assistant2).toBeVisible();
    const domText2 = await assistant2.innerText();

    expect(domText2).toContain(emailAlice);
    expect(domText2).toContain(phoneAlice);
    expect(domText2).toContain(emailBob);
    expect(domText2).not.toContain('«EMAIL_1»');
    expect(domText2).not.toContain('«EMAIL_2»');
  });

  // ─── Test 4: Service Worker Restart / Suspension Resilience ───────────────
  test('4: Survives service worker termination and restores follow-up from session storage', async () => {
    const convId = 'conv-sw-persistence';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const emailClara = 'clara.oswald@tardis.co.uk';
    await page.locator('#prompt-textarea').fill(`Hi, Clara here with email ${emailClara}.`);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    expect(server.loggedRequests.length).toBe(1);
    expect(server.loggedRequests[0].body).toContain('«EMAIL_1»');
    expect(server.loggedRequests[0].body).not.toContain(emailClara);

    // Terminate service worker process via CDP Target.closeTarget
    const cdp = await context.newCDPSession(page);
    const { targetInfos } = await cdp.send('Target.getTargets');
    const swTarget = targetInfos.find((t) => t.type === 'service_worker');
    if (swTarget) {
      await cdp.send('Target.closeTarget', { targetId: swTarget.targetId });
    }

    // Small delay to allow worker termination
    await new Promise((r) => setTimeout(r, 600));
    server.clearLoggedRequests();

    // Send follow-up in the same conversation
    await page.locator('#prompt-textarea').fill(`Checking back, my email is still ${emailClara}.`);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    expect(server.loggedRequests.length).toBe(1);
    // Entity still maps to EMAIL_1
    expect(server.loggedRequests[0].body).toContain('«EMAIL_1»');
    expect(server.loggedRequests[0].body).not.toContain(emailClara);

    // Second message DOM restores Clara's email
    const secondAssistant = page.locator('.assistant-message').nth(1);
    const secondText = await secondAssistant.innerText();
    expect(secondText).toContain(emailClara);
    expect(secondText).not.toContain('«EMAIL_1»');
  });

  // ─── Test 5: Fail-Closed Security Notice on Unreachable Worker ─────────
  test('5: Enforces fail-closed security when worker is unreachable (blocks request, shows notice)', async () => {
    const convId = 'conv-fail-closed-test';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    // Inject simulator in MAIN world that intercepts RATCHET_MAIN and returns failure response
    await page.evaluate(() => {
      window.addEventListener(
        'message',
        (evt) => {
          if (evt.data && evt.data.source === 'RATCHET_MAIN' && evt.data.type === 'REDACT_REQUEST') {
            evt.stopImmediatePropagation();
            // Return failure simulating background worker being dead or unreachable
            window.postMessage(
              {
                source: 'RATCHET_ISOLATED',
                requestId: evt.data.requestId,
                success: false,
                error: 'Could not establish connection. Background worker unreachable.',
              },
              '*',
            );
          }
        },
        true, // capture phase
      );
    });

    const secretPrompt = 'Top secret info: my confidential email is secret.agent@mi6.gov.uk.';
    await page.locator('#prompt-textarea').fill(secretPrompt);
    await page.locator('#send-textarea-btn').click();

    // 1. Assert visible privacy notification banner appeared in the DOM
    const noticeBanner = page.locator('#ratchet-privacy-notice');
    await expect(noticeBanner).toBeVisible({ timeout: 5000 });
    const noticeText = await noticeBanner.innerText();
    expect(noticeText).toContain('Ratchet: Outgoing request blocked');

    // 2. Assert request was BLOCKED and NEVER reached the server
    expect(server.loggedRequests.length).toBe(0);

    // 3. Page status reflects error
    await expect(page.locator('#status')).toContainText('Error:');
  });
});
