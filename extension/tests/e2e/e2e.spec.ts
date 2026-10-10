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
const extensionDistPath = path.resolve(__dirname, '../../dist-test');

test.describe('Ratchet Privacy Shield E2E Interception & Restoration', () => {
  let server: MockChatServer;
  let context: BrowserContext;
  let page: Page;
  let tempUserDataDir: string;
  let extensionId: string;

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
    extensionId = worker.url().split('/')[2];

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

  // ─── Test 0: Production Manifest vs Test Manifest Audit ───────────────────
  test('0: Production dist/manifest.json contains NO localhost or 127.0.0.1 entries', () => {
    const prodManifestPath = path.resolve(__dirname, '../../dist/manifest.json');
    expect(fs.existsSync(prodManifestPath), 'Production dist/manifest.json must exist').toBe(true);

    const prodManifest = JSON.parse(fs.readFileSync(prodManifestPath, 'utf-8'));
    const prodManifestStr = JSON.stringify(prodManifest);

    // Production manifest MUST NOT contain localhost or 127.0.0.1
    expect(prodManifestStr).not.toContain('localhost');
    expect(prodManifestStr).not.toContain('127.0.0.1');

    // Test build manifest (dist-test) MUST contain localhost for mock endpoints
    const testManifestPath = path.resolve(__dirname, '../../dist-test/manifest.json');
    expect(fs.existsSync(testManifestPath), 'Test dist-test/manifest.json must exist').toBe(true);

    const testManifest = JSON.parse(fs.readFileSync(testManifestPath, 'utf-8'));
    const testManifestStr = JSON.stringify(testManifest);
    expect(testManifestStr).toContain('localhost');
    expect(testManifestStr).toContain('127.0.0.1');
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

    // Requirement Stage 4.1: Restores user message containers too (e.g. reloaded history)
    await page.evaluate(() => {
      (window as any).simulateReloadHistory('Past turn: User previously asked about «EMAIL_1» and key «API_KEY_1»');
    });

    const userHistory = page.locator('.user-message').last();
    await expect(userHistory).toBeVisible();
    await expect(userHistory).toContainText(emailAlice);
    await expect(userHistory).toContainText(apiKeyAlice);
    await expect(userHistory).not.toContainText('«EMAIL_1»');
    await expect(userHistory).not.toContainText('«API_KEY_1»');

    // Ensure input box is NEVER rewritten or touched
    await page.locator('#prompt-textarea').fill('Draft containing literal «EMAIL_1»');
    await expect(page.locator('#prompt-textarea')).toHaveValue('Draft containing literal «EMAIL_1»');
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

  // ─── Test 6: Options Page UI (ReDoS Validation, Entity Toggles, Clear Mappings) ───
  test('6: Options page validates ReDoS in UI, adds safe custom rule, and executes clear-all-mappings', async () => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await optionsPage.waitForLoadState('domcontentloaded');

    // 1. Verify general controls loaded
    await expect(optionsPage.locator('#sensitivity-select')).toBeVisible();
    await expect(optionsPage.locator('#entity-toggle-EMAIL')).toBeVisible();

    // 2. ReDoS validation in UI: Type catastrophic regex pattern
    await optionsPage.locator('#new-rule-name').fill('Malicious Test Pattern');
    await optionsPage.locator('#new-rule-category').fill('MALICIOUS');
    await optionsPage.locator('#new-rule-pattern').fill('(a+)+$');

    // Assert validation error appears and Add Rule button is disabled
    const validationStatus = optionsPage.locator('#rule-validation-status');
    await expect(validationStatus).toBeVisible();
    await expect(validationStatus).toContainText('ReDoS risk');
    await expect(optionsPage.locator('#add-rule-btn')).toBeDisabled();

    // 3. Enter safe regex pattern
    await optionsPage.locator('#new-rule-pattern').fill('PRJ-[0-9]{4}');
    await expect(validationStatus).toContainText('Safe regex pattern');
    await expect(optionsPage.locator('#add-rule-btn')).toBeEnabled();

    // 4. Click Add Rule
    await optionsPage.locator('#add-rule-btn').click();
    await expect(optionsPage.locator('.rule-item')).toContainText('Malicious Test Pattern');
    await expect(optionsPage.locator('.rule-item')).toContainText('PRJ-[0-9]{4}');

    // 5. Test Clear All Conversation Mappings danger zone button
    await optionsPage.locator('#clear-all-mappings-btn').click();
    const clearStatus = optionsPage.locator('#clear-status-msg');
    await expect(clearStatus).toBeVisible();
    await expect(clearStatus).toContainText('All conversation mappings cleared');

    await optionsPage.close();
  });

  // ─── Test 7: Popup UI renders live data and controls ───
  test('7: Popup UI renders status, controls, and session category summary', async () => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    await expect(popupPage.locator('#global-shield-toggle')).toBeVisible();
    await expect(popupPage.locator('#sensitivity-selector')).toBeVisible();
    await expect(popupPage.locator('#session-total-redacted')).toBeVisible();
    await expect(popupPage.locator('#open-options-btn')).toBeVisible();

    await popupPage.close();
  });

  // ─── Test 8: Site Toggled Off leaves Request Body Unchanged ───────────────
  test('8: Site toggled off leaves request body unchanged and popup shows site as unprotected', async () => {
    // 1. Toggle mock site off via extension settings
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await extPage.evaluate(() => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['ratchet_settings'], (res) => {
          const settings = res.ratchet_settings || {};
          settings.enabledSites = { ...(settings.enabledSites || {}), mock: false };
          chrome.storage.local.set({ ratchet_settings: settings }, () => resolve());
        });
      });
    });
    await extPage.close();

    // 2. Send prompt on mock site
    const convId = 'conv-site-off-e2e';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const rawEmail = 'unprotected.user@plaindomain.com';
    await page.locator('#prompt-textarea').fill(`My email is ${rawEmail}`);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    // Assert body was left UNCHANGED because site is toggled off
    expect(server.loggedRequests.length).toBe(1);
    expect(server.loggedRequests[0].body).toContain(rawEmail);
    expect(server.loggedRequests[0].body).not.toContain('«EMAIL_');

    // 3. Open popup and verify site toggle is unchecked (unprotected)
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    // Re-enable mock site for subsequent tests
    await popupPage.evaluate(() => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['ratchet_settings'], (res) => {
          const settings = res.ratchet_settings || {};
          settings.enabledSites = { ...(settings.enabledSites || {}), mock: true };
          chrome.storage.local.set({ ratchet_settings: settings }, () => resolve());
        });
      });
    });
    await popupPage.close();
  });

  // ─── Test 9: Low vs High Sensitivity Changes Redaction ────────────────────
  test('9: Low vs High sensitivity changes what is redacted on the same input', async () => {
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);

    // Add a custom rule with confidence 0.65 (between Low=0.85 and High=0.45 threshold)
    await extPage.evaluate(() => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['ratchet_settings'], (res) => {
          const settings = res.ratchet_settings || {};
          settings.customRules = [
            {
              id: 'rule_sens_test',
              name: 'Secret Code',
              category: 'SECRET_CODE',
              type: 'keyword',
              values: ['CodenameZephyr'],
              confidence: 0.65,
              enabled: true,
            },
          ];
          settings.sensitivity = 'low'; // threshold 0.85 -> 0.65 is below threshold
          chrome.storage.local.set({ ratchet_settings: settings }, () => resolve());
        });
      });
    });

    const convId = 'conv-sens-test';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const prompt = 'Project is CodenameZephyr.';

    // Send under LOW sensitivity (threshold 0.85) -> CodenameZephyr should NOT be redacted
    await page.locator('#prompt-textarea').fill(prompt);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    expect(server.loggedRequests.length).toBe(1);
    expect(server.loggedRequests[0].body).toContain('CodenameZephyr');
    expect(server.loggedRequests[0].body).not.toContain('«SECRET_CODE_');

    // Switch to HIGH sensitivity (threshold 0.45) -> CodenameZephyr SHOULD be redacted
    await extPage.evaluate(() => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['ratchet_settings'], (res) => {
          const settings = res.ratchet_settings || {};
          settings.sensitivity = 'high'; // threshold 0.45 -> 0.65 is above threshold
          chrome.storage.local.set({ ratchet_settings: settings }, () => resolve());
        });
      });
    });
    await extPage.close();

    server.clearLoggedRequests();
    await page.locator('#prompt-textarea').fill(prompt);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    expect(server.loggedRequests.length).toBe(1);
    expect(server.loggedRequests[0].body).not.toContain('CodenameZephyr');
    expect(server.loggedRequests[0].body).toContain('«SECRET_CODE_1»');
  });

  // ─── Test 10: Persistent Storage Round-Trip Across Browser Reopen ─────────
  test('10: Persistence on survives browser close & reopen, follow-up restores, and expiry prunes mapping', async () => {
    // 1. Enable persistent storage
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await extPage.evaluate(() => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['ratchet_settings'], (res) => {
          const settings = res.ratchet_settings || {};
          settings.enablePersistence = true;
          settings.persistenceExpiryHours = 24;
          chrome.storage.local.set({ ratchet_settings: settings }, () => resolve());
        });
      });
    });
    await extPage.close();

    // 2. Perform initial turn with persistence on
    const convId = 'conv-persistent-roundtrip';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const persistentEmail = 'dr.who@gallifrey.space';
    await page.locator('#prompt-textarea').fill(`Contact: ${persistentEmail}`);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    expect(server.loggedRequests[0].body).toContain('«EMAIL_1»');
    expect(server.loggedRequests[0].body).not.toContain(persistentEmail);

    // 2b. Assert that chrome.storage.local contains ciphertext and NOT the plain values
    const currentWorker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const storageDump = await currentWorker.evaluate(() => {
      return new Promise<Record<string, any>>((resolve) => {
        chrome.storage.local.get(null, (items) => resolve(items));
      });
    });

    const encRecord = storageDump[`enc:conv:${convId}`];
    expect(encRecord).toBeDefined();
    expect(typeof encRecord.ciphertext).toBe('string');
    expect(encRecord.ciphertext.length).toBeGreaterThan(16);
    expect(typeof encRecord.iv).toBe('string');
    expect(encRecord.iv.length).toBeGreaterThan(8);
    // Crucial threat model check: plaintext must NEVER appear in the persisted record
    const dumpedRecordStr = JSON.stringify(encRecord);
    expect(dumpedRecordStr).not.toContain(persistentEmail);
    expect(dumpedRecordStr).not.toContain('dr.who');

    // 3. Fully close and reopen the browser context (wipes all in-memory chrome.storage.session)
    await context.close();

    context = await chromium.launchPersistentContext(tempUserDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionDistPath}`,
        `--load-extension=${extensionDistPath}`,
        '--no-sandbox',
      ],
    });

    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    extensionId = worker.url().split('/')[2];
    page = await context.newPage();

    // 4. Reopen conversation after browser reopen and verify restored history
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      (window as any).simulateReloadHistory('Turn from past session: «EMAIL_1»');
    });

    const userHistory = page.locator('.user-message').last();
    await expect(userHistory).toBeVisible();
    await expect(userHistory).toContainText(persistentEmail);
    await expect(userHistory).not.toContainText('«EMAIL_1»');

    // 5. Test expiry: expire the encrypted record in storage
    const managePage = await context.newPage();
    await managePage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await managePage.evaluate((cid) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(null, (all) => {
          const updates: Record<string, any> = {};
          for (const [k, v] of Object.entries(all)) {
            if (k.startsWith('enc:conv:')) {
              (v as any).expiresAt = Date.now() - 1000 * 3600; // 1h ago (expired)
              updates[k] = v;
            }
          }
          chrome.storage.local.set(updates, () => {
            // Also clear volatile session cache for this conversation so it re-reads from storage
            chrome.storage.session.remove(['conv:' + cid], () => resolve());
          });
        });
      });
    }, convId);

    // Query mapping via service worker message -> must return null because expired
    const expiredCheck = await managePage.evaluate((cid) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getMapping', conversationId: cid }, (res) => {
          resolve(res?.data?.mappings?.length || 0);
        });
      });
    }, convId);
    await managePage.close();

    expect(expiredCheck).toBe(0);
  });

  // ─── Test 11: Stage 5 NER Round-Trip Interception & Restoration ───────────
  test('11: Stage 5 NER round-trip: name, org, and location are redacted on the wire and restored in the display', async () => {
    const convId = 'conv-ner-roundtrip';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const nerPrompt = 'Dr. Tariq Mehmood met with OpenAI representatives in Tokyo.';
    await page.locator('#prompt-textarea').fill(nerPrompt);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    // 1. Assert redacted on the wire
    expect(server.loggedRequests.length).toBe(1);
    const wireBody = server.loggedRequests[0].body;
    expect(wireBody).toContain('«PERSON_1»');
    expect(wireBody).toContain('«ORG_1»');
    expect(wireBody).toContain('«LOCATION_1»');
    expect(wireBody).not.toContain('Tariq Mehmood');
    expect(wireBody).not.toContain('OpenAI');
    expect(wireBody).not.toContain('Tokyo');

    // 2. Assert restored in page display (assistant echoes and restorer restores)
    const assistantMsg = page.locator('.assistant-message').last();
    await expect(assistantMsg).toBeVisible();
    await expect(assistantMsg).toContainText('Tariq Mehmood');
    await expect(assistantMsg).toContainText('OpenAI');
    await expect(assistantMsg).toContainText('Tokyo');
    await expect(assistantMsg).not.toContainText('«PERSON_1»');
    await expect(assistantMsg).not.toContainText('«ORG_1»');
    await expect(assistantMsg).not.toContainText('«LOCATION_1»');

    // 4. Measure memory via CDP Performance.getMetrics
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    const perfMetrics = await client.send('Performance.getMetrics');
    const jsHeapUsed = perfMetrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value || 0;
    const jsHeapTotal = perfMetrics.metrics.find((m) => m.name === 'JSHeapTotalSize')?.value || 0;

    console.log(`\n========================================`);
    console.log(`🧠 CDP Performance.getMetrics After NER Load:`);
    console.log(`   JSHeapUsedSize:  ${(jsHeapUsed / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   JSHeapTotalSize: ${(jsHeapTotal / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`========================================\n`);

    // Strict memory constraint check: must be under 50 MB
    expect(jsHeapUsed / (1024 * 1024)).toBeLessThan(50);
  });

  // ─── Test 12: Custom-Rule ReDoS Protection in Real Extension ─────────────
  test('12: Custom-rule ReDoS protection in real extension: rejects slow patterns in UI and runtime guard prevents worker hang', async () => {
    // 1. Verify Options Page UI rejects slow backtracking regexes
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await optionsPage.waitForLoadState('domcontentloaded');

    await optionsPage.locator('#new-rule-name').fill('Backtracking Pattern');
    await optionsPage.locator('#new-rule-category').fill('PROJECT');
    await optionsPage.locator('#new-rule-pattern').fill('x*x*x*x*y');

    const validationStatus = optionsPage.locator('#rule-validation-status');
    await expect(validationStatus).toBeVisible();
    await expect(validationStatus).toContainText('ReDoS risk');
    await expect(optionsPage.locator('#add-rule-btn')).toBeDisabled();
    await optionsPage.close();

    // 2. Programmatically inject an unsafe custom rule into settings (simulating unvalidated/migrated storage)
    // and verify that the real service worker skips it at runtime without hanging the prompt flow.
    const managePage = await context.newPage();
    await managePage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await managePage.evaluate(async () => {
      const data: any = await chrome.storage.local.get('ratchet_settings');
      const settings = data.ratchet_settings || {};
      settings.customRules = settings.customRules || [];
      settings.customRules.push({
        id: 'unsafe-rule-e2e',
        name: 'Injected Backtracking Rule',
        category: 'SECRET',
        type: 'regex',
        pattern: 'x*x*x*x*y',
        enabled: true,
        confidence: 0.9,
      });
      await chrome.storage.local.set({ ratchet_settings: settings });
    });
    await managePage.close();

    // 3. Send a prompt with 250 repeating 'x's which would freeze an un-guarded engine
    const convId = 'conv-redos-runtime-guard';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const adversarialPrompt = 'Incident: ' + 'x'.repeat(250) + '! Contacted admin@internal.example.org';
    await page.locator('#prompt-textarea').fill(adversarialPrompt);
    const t0 = Date.now();
    await page.locator('#send-textarea-btn').click();

    // The skipped custom rule forces the review panel open with a visible warning naming the rule
    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });
    const { shadowRoot } = await getCdpShadowRoot(page);
    const warnNode = findNodeByPredicate(
      shadowRoot,
      (n) => getNodeAttr(n, 'id') === 'ratchet-skipped-rules-warning',
    );
    expect(warnNode, 'Review panel must display skipped rules warning').toBeTruthy();
    expect(getNodeText(warnNode)).toContain('Injected Backtracking Rule');

    // Confirm sending via Enter key
    await page.keyboard.press('Enter');

    // Assert that redaction completes quickly and doesn't hang the worker
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 10000 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(8000);

    // Verify email was redacted normally and request went through
    expect(server.loggedRequests.length).toBe(1);
    const wireBody = server.loggedRequests[0].body;
    expect(wireBody).toContain('«EMAIL_1»');
    expect(wireBody).not.toContain('admin@internal.example.org');

    // Clean up injected rule
    const cleanupPage = await context.newPage();
    await cleanupPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await cleanupPage.evaluate(async () => {
      const data: any = await chrome.storage.local.get('ratchet_settings');
      if (data.ratchet_settings?.customRules) {
        data.ratchet_settings.customRules = data.ratchet_settings.customRules.filter(
          (r: any) => r.id !== 'unsafe-rule-e2e'
        );
        await chrome.storage.local.set({ ratchet_settings: data.ratchet_settings });
      }
    });
    await cleanupPage.close();
  });

  // ─── Helpers for Closed Shadow DOM Inspection & Interaction via CDP ────
  function findNodeByPredicate(node: any, predicate: (n: any) => boolean): any | null {
    if (!node) return null;
    if (predicate(node)) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeByPredicate(child, predicate);
        if (found) return found;
      }
    }
    if (node.shadowRoots) {
      for (const sr of node.shadowRoots) {
        const found = findNodeByPredicate(sr, predicate);
        if (found) return found;
      }
    }
    return null;
  }

  function findAllNodesByPredicate(node: any, predicate: (n: any) => boolean, results: any[] = []): any[] {
    if (!node) return results;
    if (predicate(node)) results.push(node);
    if (node.children) {
      for (const child of node.children) {
        findAllNodesByPredicate(child, predicate, results);
      }
    }
    if (node.shadowRoots) {
      for (const sr of node.shadowRoots) {
        findAllNodesByPredicate(sr, predicate, results);
      }
    }
    return results;
  }

  function getNodeAttr(node: any, attrName: string): string | null {
    if (!node?.attributes) return null;
    for (let i = 0; i < node.attributes.length; i += 2) {
      if (node.attributes[i].toLowerCase() === attrName.toLowerCase()) {
        return node.attributes[i + 1];
      }
    }
    return null;
  }

  function getNodeText(node: any): string {
    let text = '';
    if (node.nodeType === 3) {
      text += node.nodeValue || '';
    }
    if (node.children) {
      for (const c of node.children) {
        text += getNodeText(c);
      }
    }
    return text;
  }

  async function getCdpShadowRoot(page: Page) {
    const client = await page.context().newCDPSession(page);
    await client.send('DOM.enable');
    const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const hostNode = findNodeByPredicate(root, (n) => getNodeAttr(n, 'id') === 'ratchet-review-host');
    expect(hostNode, 'Host element #ratchet-review-host should exist in DOM').toBeTruthy();
    const shadowRoot = hostNode.shadowRoots ? hostNode.shadowRoots[0] : null;
    expect(shadowRoot, 'Closed shadow root should be present on host in CDP').toBeTruthy();
    return { client, root, hostNode, shadowRoot };
  }

  async function clickCdpNode(client: any, page: Page, node: any) {
    expect(node, 'Node to click must exist').toBeTruthy();
    const { model } = await client.send('DOM.getBoxModel', { nodeId: node.nodeId });
    const centerX = (model.content[0] + model.content[2]) / 2;
    const centerY = (model.content[1] + model.content[5]) / 2;
    await page.mouse.click(centerX, centerY);
  }

  async function setCdpSelectValue(client: any, node: any, value: string) {
    expect(node, 'Node to select value on must exist').toBeTruthy();
    const { object } = await client.send('DOM.resolveNode', { nodeId: node.nodeId });
    await client.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function() { this.value = ${JSON.stringify(value)}; this.dispatchEvent(new Event("change")); }`,
    });
  }

  async function updateSettings(settingsToApply: any) {
    const managePage = await context.newPage();
    await managePage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await managePage.evaluate(async (updates) => {
      const data: any = await chrome.storage.local.get('ratchet_settings');
      const settings = data.ratchet_settings || {};
      Object.assign(settings, updates);
      await chrome.storage.local.set({ ratchet_settings: settings });
    }, settingsToApply);
    await managePage.close();
  }

  // ─── Test 13: Review Panel Renders Detected Items & Sends Redacted (Enter) ───
  test('13: Review panel displays detected items with category/original/placeholder and sends redacted on Enter', async () => {
    // Enable review for mock site
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: true },
      reviewTimeoutSeconds: 60,
    });

    const convId = 'conv-review-display';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const promptText = 'Please contact Dr. Tariq Mehmood at tariq.mehmood@example.com.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    // 1. Wait for review panel host to appear in DOM
    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });

    // 2. Inspect closed Shadow DOM contents via CDP
    const { client, shadowRoot } = await getCdpShadowRoot(page);

    // Verify title and banner
    const titleNode = findNodeByPredicate(shadowRoot, (n) => getNodeAttr(n, 'id') === 'ratchet-panel-title');
    expect(titleNode).toBeTruthy();
    expect(getNodeText(titleNode)).toContain('Review Outgoing Prompt');

    // Verify detected item cards
    const cardNodes = findAllNodesByPredicate(shadowRoot, (n) => {
      const cls = getNodeAttr(n, 'class');
      return cls ? cls.includes('item-card') : false;
    });
    expect(cardNodes.length).toBe(2);

    // Verify both items (PERSON and EMAIL) are displayed with original and placeholder
    const allCardsText = cardNodes.map((c) => getNodeText(c)).join(' --- ');
    expect(allCardsText).toContain('PERSON');
    expect(allCardsText).toContain('Tariq Mehmood');
    expect(allCardsText).toContain('«PERSON_1»');
    expect(allCardsText).toContain('EMAIL');
    expect(allCardsText).toContain('tariq.mehmood@example.com');
    expect(allCardsText).toContain('«EMAIL_1»');

    // 3. Confirm with Enter key (default action: Send Redacted)
    await page.keyboard.press('Enter');

    // Verify panel closed
    await page.waitForSelector('#ratchet-review-host', { state: 'detached', timeout: 5000 });

    // Verify server received redacted request on the wire
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });
    expect(server.loggedRequests.length).toBe(1);
    const wireBody = server.loggedRequests[0].body;
    expect(wireBody).toContain('«PERSON_1»');
    expect(wireBody).toContain('«EMAIL_1»');
    expect(wireBody).not.toContain('Tariq Mehmood');
    expect(wireBody).not.toContain('tariq.mehmood@example.com');

    // Verify displayed reply restored real values
    const assistantMsg = page.locator('.assistant-message').last();
    await expect(assistantMsg).toContainText('Tariq Mehmood');
    await expect(assistantMsg).toContainText('tariq.mehmood@example.com');

    await client.detach();
  });

  // ─── Test 14: Un-redacting One Item Puts Only That Value on the Wire ──────
  test('14: Un-redacting a single item transmits only that value unredacted while other items stay redacted', async () => {
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: true },
      reviewTimeoutSeconds: 60,
    });

    const convId = 'conv-review-unredact';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const promptText = 'Notify Dr. Tariq Mehmood via dev-alerts@internal.corp.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    // Wait for review panel
    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });
    const { client, shadowRoot } = await getCdpShadowRoot(page);

    // Find the item card that contains Tariq Mehmood
    const cardNodes = findAllNodesByPredicate(shadowRoot, (n) => {
      const cls = getNodeAttr(n, 'class');
      return cls ? cls.includes('item-card') : false;
    });
    const personCard = cardNodes.find((c) => getNodeText(c).includes('Tariq Mehmood'));
    expect(personCard, 'Card containing Tariq Mehmood should exist').toBeTruthy();

    // Find "Un-redact" button on the Tariq Mehmood card
    const unredactBtn = findNodeByPredicate(personCard, (n) => {
      const cls = getNodeAttr(n, 'class');
      return cls?.includes('btn-toggle-unredact');
    });
    expect(unredactBtn, 'Un-redact button must exist').toBeTruthy();

    // Click Un-redact for card via CDP mouse click
    await clickCdpNode(client, page, unredactBtn);

    // Press Enter to Send Redacted (with Tariq Mehmood kept original)
    await page.keyboard.press('Enter');

    // Wait for completion
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    // Assert wire body:
    // - Tariq Mehmood is UN-REDACTED (original value sent on the wire)
    // - dev-alerts@internal.corp is REDACTED (placeholder «EMAIL_1» sent on the wire)
    expect(server.loggedRequests.length).toBe(1);
    const wireBody = server.loggedRequests[0].body;
    expect(wireBody).toContain('Tariq Mehmood');
    expect(wireBody).not.toContain('«PERSON_1»');
    expect(wireBody).toContain('«EMAIL_1»');
    expect(wireBody).not.toContain('dev-alerts@internal.corp');

    await client.detach();
  });

  // ─── Test 15: Cancel (Esc) Sends Nothing and Leaves Chat UI Usable ────────
  test('15: User cancel (Esc or button) sends nothing over the wire and leaves chat UI usable', async () => {
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: true },
      reviewTimeoutSeconds: 60,
    });

    const convId = 'conv-review-cancel';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const promptText = 'Send confidential code to security-lead@bank.com immediately.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    // Wait for review panel
    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });

    // Press Escape to cancel
    await page.keyboard.press('Escape');

    // Assert panel closed
    await page.waitForSelector('#ratchet-review-host', { state: 'detached', timeout: 5000 });

    // Assert warning notice appeared
    const notice = page.locator('#ratchet-warning-notice');
    await expect(notice).toBeVisible({ timeout: 5000 });
    expect(await notice.innerText()).toContain('prompt cancelled by user');

    // Assert ZERO requests sent on the wire
    expect(server.loggedRequests.length).toBe(0);

    // Assert chat UI remains completely usable: user can edit and send a subsequent prompt
    await page.locator('#prompt-textarea').fill('Send updated code to security-lead@bank.com immediately.');
    expect(await page.locator('#prompt-textarea').inputValue()).toBe('Send updated code to security-lead@bank.com immediately.');
  });

  // ─── Test 16: Review Timeout Fails Closed ────────────────────────────────
  test('16: Review timeout fails closed: blocks wire transmission, shows notice, and leaves chat UI usable', async () => {
    // Configure a short 2-second review timeout
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: true },
      reviewTimeoutSeconds: 2,
    });

    const convId = 'conv-review-timeout';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const promptText = 'Important briefing for contact@partner.org in progress.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    // Wait for review panel to appear
    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });

    // Do nothing and wait for the 2-second timeout to elapse and panel to detach
    await page.waitForSelector('#ratchet-review-host', { state: 'detached', timeout: 7000 });

    // Assert privacy notice displays review timeout block
    const notice = page.locator('#ratchet-privacy-notice');
    await expect(notice).toBeVisible({ timeout: 5000 });
    expect(await notice.innerText()).toContain('Review timed out');

    // Assert fail-closed: NO request was dispatched to the server
    expect(server.loggedRequests.length).toBe(0);

    // Assert chat UI remains intact and usable: user can type new prompt
    await page.locator('#prompt-textarea').fill('Follow-up after timeout');
    expect(await page.locator('#prompt-textarea').inputValue()).toBe('Follow-up after timeout');

    // Restore standard timeout
    await updateSettings({ reviewTimeoutSeconds: 60 });
  });

  // ─── Test 17: Panel Contents Are Not Reachable from Page JS ──────────────
  test('17: Panel contents and raw values are unreachable from page JS (closed Shadow DOM guarantee)', async () => {
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: true },
      reviewTimeoutSeconds: 60,
    });

    const convId = 'conv-review-isolation';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const promptText = 'Confidential password reset token for admin@shield.net.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });

    // Evaluate in MAIN world (simulating page JS / untrusted page scripts)
    const pageJsAccess = await page.evaluate(() => {
      const host = document.querySelector('#ratchet-review-host') as HTMLElement | null;
      return {
        hostExists: host !== null,
        shadowRootIsNull: host ? host.shadowRoot === null : false,
        innerTextEmpty: host ? host.innerText.trim() === '' : false,
        innerHTMLTextEmpty: host ? host.innerHTML.trim() === '' : false,
        querySelectorItemCard: document.querySelector('.item-card') !== null,
        querySelectorOrigVal: document.querySelector('.orig-val') !== null,
      };
    });

    // 1. Host exists in DOM
    expect(pageJsAccess.hostExists).toBe(true);

    // 2. host.shadowRoot is strictly null in page JS because mode: 'closed'
    expect(pageJsAccess.shadowRootIsNull).toBe(true);

    // 3. host innerText and innerHTML are empty in page JS
    expect(pageJsAccess.innerTextEmpty).toBe(true);
    expect(pageJsAccess.innerHTMLTextEmpty).toBe(true);

    // 4. Page JS querySelector cannot pierce or find any inner card or original PII
    expect(pageJsAccess.querySelectorItemCard).toBe(false);
    expect(pageJsAccess.querySelectorOrigVal).toBe(false);

    // Close panel with Escape
    await page.keyboard.press('Escape');
    await page.waitForSelector('#ratchet-review-host', { state: 'detached', timeout: 5000 });
  });

  // ─── Test 18: Send As-Is with Confirmation Warning Transmits Plain Text ───
  test('18: Send as-is action displays warning confirmation and transmits plain text if confirmed', async () => {
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: true },
      reviewTimeoutSeconds: 60,
    });

    const convId = 'conv-review-asis';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const promptText = 'Public support inquiry from public.user@domain.org.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });
    const { client, shadowRoot } = await getCdpShadowRoot(page);

    // Click "Send As-Is" button in footer
    const sendAsIsBtn = findNodeByPredicate(shadowRoot, (n) => getNodeAttr(n, 'id') === 'ratchet-btn-asis');
    expect(sendAsIsBtn).toBeTruthy();
    await clickCdpNode(client, page, sendAsIsBtn);

    // Re-fetch shadow DOM to verify confirmation box became visible
    const { shadowRoot: updatedRoot } = await getCdpShadowRoot(page);
    const confirmBox = findNodeByPredicate(updatedRoot, (n) => getNodeAttr(n, 'id') === 'ratchet-confirm-asis-box');
    expect(confirmBox).toBeTruthy();
    const confirmCls = getNodeAttr(confirmBox, 'class');
    expect(confirmCls).toContain('visible');
    expect(getNodeText(confirmBox)).toContain('Send unredacted data over the wire?');

    // Click "Send As-Is Now" confirmation button
    const confirmYesBtn = findNodeByPredicate(updatedRoot, (n) => getNodeAttr(n, 'id') === 'ratchet-confirm-yes');
    expect(confirmYesBtn).toBeTruthy();
    await clickCdpNode(client, page, confirmYesBtn);

    // Wait for completion
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    // Assert wire body contains plain text (sent as-is without placeholders)
    expect(server.loggedRequests.length).toBe(1);
    const wireBody = server.loggedRequests[0].body;
    expect(wireBody).toContain('public.user@domain.org');
    expect(wireBody).not.toContain('«EMAIL_1»');

    // Reset settings for subsequent clean test runs
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: false },
      reviewTimeoutSeconds: 60,
    });

    await client.detach();
  });

  // ─── Test 19: Fail-Closed on Skipped Custom Rules When Cancelled ─────────
  test('19: Skipped custom rule forces review panel with warning, cancelling fails closed and blocks wire request', async () => {
    // 1. Inject an unsafe rule and explicitly disable review for general mock site prompts
    await updateSettings({
      reviewBeforeSend: false,
      reviewSites: { chatgpt: false, claude: false, mock: false },
      customRules: [
        {
          id: 'unsafe-cancel-test',
          name: 'Blocked Malformed Rule',
          category: 'SECRET',
          type: 'regex',
          pattern: '(a+)+$',
          enabled: true,
          confidence: 0.9,
        },
      ],
    });

    const convId = 'conv-skipped-rule-cancel';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const promptText = 'Confidential project details to be checked.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    // 2. Review panel MUST be forced open despite reviewBeforeSend: false
    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });
    const { client, shadowRoot } = await getCdpShadowRoot(page);
    const warnNode = findNodeByPredicate(
      shadowRoot,
      (n) => getNodeAttr(n, 'id') === 'ratchet-skipped-rules-warning',
    );
    expect(warnNode, 'Review panel must display skipped rules warning').toBeTruthy();
    expect(getNodeText(warnNode)).toContain('Blocked Malformed Rule');

    // 3. User cancels review via Escape key
    await page.keyboard.press('Escape');
    await page.waitForSelector('#ratchet-review-host', { state: 'detached', timeout: 3000 });

    // 4. Assert fail-closed: 0 requests reach the wire
    expect(server.loggedRequests.length).toBe(0);

    // 5. Privacy notice is displayed and chat UI remains usable
    const notice = page.locator('#ratchet-privacy-notice');
    await expect(notice).toBeVisible({ timeout: 5000 });
    expect(await notice.innerText()).toContain('were skipped');

    await page.locator('#prompt-textarea').fill('Safe prompt without skipped rules');
    expect(await page.locator('#prompt-textarea').inputValue()).toBe('Safe prompt without skipped rules');

    // Clean up
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, mock: false },
      customRules: [],
    });
    await client.detach();
  });

  // ─── Test 20: "My Sensitive Terms" Matching & Wire Zero-Leakage ──────────
  test('20: "My sensitive terms" in Options: matches names, employers, projects, places with possessives and last-name alone variants, leaving zero wire leakage', async () => {
    // 1. Verify Options Page UI renders the sensitive storage security disclosure notice
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await optionsPage.waitForLoadState('domcontentloaded');

    const noticeEl = optionsPage.locator('#sensitive-terms-storage-notice');
    await expect(noticeEl).toBeVisible();
    expect(await noticeEl.innerText()).toContain('stored locally on this machine and is itself sensitive');

    await optionsPage.close();

    // 2. Configure sensitive terms
    await updateSettings({
      reviewBeforeSend: false,
      reviewSites: { chatgpt: true, claude: true, mock: false },
      sensitiveTerms: [
        {
          id: 'term-marcus',
          term: 'Marcus Vance',
          category: 'PERSON',
          enabled: true,
        },
        {
          id: 'term-solaria',
          term: 'Solaria Dynamics',
          category: 'ORG',
          enabled: true,
        },
        {
          id: 'term-chimera',
          term: 'Project Chimera',
          category: 'PROJECT',
          enabled: true,
        },
        {
          id: 'term-kyoto',
          term: 'Kyoto',
          category: 'LOCATION',
          enabled: true,
        },
      ],
    });

    const convId = 'conv-sensitive-terms-e2e';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const sensitivePrompt =
      "Consulting with Marcus Vance on Project Chimera for Solaria Dynamics in Kyoto. Also Vance's team confirmed Solaria Dynamics's timeline.";
    await page.locator('#prompt-textarea').fill(sensitivePrompt);
    await page.locator('#send-textarea-btn').click();
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });

    // 3. Inspect wire request: must NOT contain ANY raw sensitive terms or variants
    expect(server.loggedRequests.length).toBe(1);
    const wireBody = server.loggedRequests[0].body;

    // Strict zero-leakage assertions:
    expect(wireBody).not.toContain('Marcus Vance');
    expect(wireBody).not.toContain('Vance');
    expect(wireBody).not.toContain("Vance's");
    expect(wireBody).not.toContain('Solaria Dynamics');
    expect(wireBody).not.toContain("Solaria Dynamics's");
    expect(wireBody).not.toContain('Project Chimera');
    expect(wireBody).not.toContain('Kyoto');

    // Placeholders must be present on the wire
    expect(wireBody).toContain('«PERSON_1»');
    expect(wireBody).toContain('«PROJECT_1»');
    expect(wireBody).toContain('«ORG_1»');
    expect(wireBody).toContain('«LOCATION_1»');

    // 4. Assert restored display in DOM
    const assistantMsg = page.locator('.assistant-message').last();
    await expect(assistantMsg).toBeVisible();
    await expect(assistantMsg).toContainText('Marcus Vance');
    await expect(assistantMsg).toContainText('Solaria Dynamics');
    await expect(assistantMsg).toContainText('Project Chimera');
    await expect(assistantMsg).toContainText('Kyoto');

    // Clean up
    await updateSettings({ sensitiveTerms: [] });
  });

  // ─── Test 21: Manual Redaction in Review Panel & Sensitive Term Enrollment ───
  test('21: Manual redaction in review panel: user selects text in prompt preview, picks category, redacts all occurrences, enrolls sensitive term, with closed Shadow DOM isolation', async () => {
    // Enable review for mock site
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, gemini: true, mock: true },
      reviewTimeoutSeconds: 60,
      sensitiveTerms: [],
    });

    const convId = 'conv-manual-redaction-e2e';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    // Prompt contains an automatically detected email AND an unrecognized project name "Chimera" appearing twice
    const promptText =
      'Chimera project briefing for admin@internal.example.org. Deploy Chimera infrastructure immediately.';
    await page.locator('#prompt-textarea').fill(promptText);
    await page.locator('#send-textarea-btn').click();

    // 1. Wait for review panel host to appear in DOM
    await page.waitForSelector('#ratchet-review-host', { state: 'attached', timeout: 5000 });
    const { client, shadowRoot } = await getCdpShadowRoot(page);

    // 2. Verify initial state: only 1 standard item detected (EMAIL)
    const previewBoxNode = findNodeByPredicate(shadowRoot, (n) => getNodeAttr(n, 'id') === 'ratchet-preview-text');
    expect(previewBoxNode, 'Preview box element should exist in review panel').toBeTruthy();
    expect(getNodeText(previewBoxNode)).toContain('«EMAIL_1»');
    expect(getNodeText(previewBoxNode)).toContain('Chimera');

    // 3. User selects "Chimera" (first word of preview box) by double-clicking it
    const { model: previewModel } = await client.send('DOM.getBoxModel', { nodeId: previewBoxNode.nodeId });
    const clickX = previewModel.content[0] + 25;
    const clickY = previewModel.content[1] + 15;
    await page.mouse.dblclick(clickX, clickY);

    // 4. Re-query shadow root on SAME CDP client to inspect active manual toolbar
    const { root: root2 } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const rootAfterSelect = findNodeByPredicate(root2, (n) => getNodeAttr(n, 'id') === 'ratchet-review-host')?.shadowRoots?.[0];
    expect(rootAfterSelect, 'Shadow root after select must exist').toBeTruthy();

    const toolbarNode = findNodeByPredicate(rootAfterSelect, (n) => getNodeAttr(n, 'id') === 'ratchet-manual-toolbar');
    expect(toolbarNode, 'Manual redaction toolbar should exist').toBeTruthy();
    const toolbarCls = getNodeAttr(toolbarNode, 'class');
    expect(toolbarCls).toContain('active');

    const selectedSpanNode = findNodeByPredicate(rootAfterSelect, (n) => getNodeAttr(n, 'id') === 'ratchet-selected-text');
    expect(getNodeText(selectedSpanNode)).toContain('Chimera');

    // 5. Select category "PROJECT"
    const catSelectNode = findNodeByPredicate(rootAfterSelect, (n) => getNodeAttr(n, 'id') === 'ratchet-manual-category');
    expect(catSelectNode).toBeTruthy();
    await setCdpSelectValue(client, catSelectNode, 'PROJECT');

    // 6. Click "Redact All Occurrences" button
    const redactBtnNode = findNodeByPredicate(rootAfterSelect, (n) => getNodeAttr(n, 'id') === 'ratchet-btn-manual-redact');
    expect(redactBtnNode).toBeTruthy();
    await clickCdpNode(client, page, redactBtnNode);

    // 7. Verify prompt preview now displays placeholder «PROJECT_1» replacing all occurrences of "Chimera"
    const { root: root3 } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const rootAfterRedact = findNodeByPredicate(root3, (n) => getNodeAttr(n, 'id') === 'ratchet-review-host')?.shadowRoots?.[0];
    expect(rootAfterRedact, 'Shadow root after redact must exist').toBeTruthy();

    const updatedPreviewNode = findNodeByPredicate(rootAfterRedact, (n) => getNodeAttr(n, 'id') === 'ratchet-preview-text');
    const previewContent = getNodeText(updatedPreviewNode);
    expect(previewContent).toContain('«PROJECT_1»');
    expect(previewContent).toContain('«EMAIL_1»');
    expect(previewContent).not.toContain('Chimera');

    // 8. Verify items list now has 2 cards (including newly added PROJECT card)
    const cardNodes = findAllNodesByPredicate(rootAfterRedact, (n) => {
      const cls = getNodeAttr(n, 'class');
      return cls ? cls.includes('item-card') : false;
    });
    expect(cardNodes.length).toBe(2);
    const cardsText = cardNodes.map((c) => getNodeText(c)).join(' --- ');
    expect(cardsText).toContain('PROJECT');
    expect(cardsText).toContain('Chimera');
    expect(cardsText).toContain('«PROJECT_1»');

    // 9. Confirm sending via Enter key (default: Send Redacted)
    await page.keyboard.press('Enter');
    await page.waitForSelector('#ratchet-review-host', { state: 'detached', timeout: 5000 });

    // 10. Verify wire request: server logged body contains placeholders and ZERO sensitive text
    await expect(page.locator('#status')).toHaveText('Completed', { timeout: 15000 });
    expect(server.loggedRequests.length).toBe(1);
    const wireBody = server.loggedRequests[0].body;

    // Zero-leakage assertions:
    expect(wireBody).toContain('«PROJECT_1»');
    expect(wireBody).toContain('«EMAIL_1»');
    expect(wireBody).not.toContain('Chimera');
    expect(wireBody).not.toContain('admin@internal.example.org');

    // 11. Verify displayed reply restores both manually redacted and standard items
    const assistantMsg = page.locator('.assistant-message').last();
    await expect(assistantMsg).toBeVisible();
    await expect(assistantMsg).toContainText('Chimera');
    await expect(assistantMsg).toContainText('admin@internal.example.org');

    // 12. Verify term was enrolled into "My sensitive terms" in chrome.storage.local
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    const storedTerms = await optionsPage.evaluate(async () => {
      const data: any = await chrome.storage.local.get('ratchet_settings');
      return data.ratchet_settings?.sensitiveTerms || [];
    });
    await optionsPage.close();

    const enrolledTerm = storedTerms.find((t: any) => t.term.toLowerCase() === 'chimera');
    expect(enrolledTerm, 'Manually redacted term should be enrolled in sensitiveTerms').toBeTruthy();
    expect(enrolledTerm.category).toBe('PROJECT');

    // 13. Verify closed Shadow DOM isolation guarantee: page JS cannot pierce or read shadow DOM
    const pageJsAccess = await page.evaluate(() => {
      const host = document.querySelector('#ratchet-review-host') as HTMLElement | null;
      return {
        shadowRootIsNull: host ? host.shadowRoot === null : true,
        querySelectorCard: document.querySelector('.item-card') !== null,
        querySelectorPreview: document.querySelector('#ratchet-preview-text') !== null,
      };
    });
    expect(pageJsAccess.shadowRootIsNull).toBe(true);
    expect(pageJsAccess.querySelectorCard).toBe(false);
    expect(pageJsAccess.querySelectorPreview).toBe(false);

    // Clean up
    await updateSettings({
      reviewBeforeSend: true,
      reviewSites: { chatgpt: true, claude: true, mock: false },
      sensitiveTerms: [],
    });

    await client.detach();
  });

  test('22: Unfamiliar paths and call styles are handled correctly and debug lines appear', async () => {
    const convId = 'conv-call-styles';
    
    // Start listening BEFORE goto so we catch 'interceptor installed'
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const email = 'secret.email@test.com';
    const createBody = () => JSON.stringify({
      messages: [{
        author: { role: 'user' },
        content: { parts: [`My email is ${email}. Say hi.`] }
      }]
    });

    await page.evaluate(async (bodyStr) => {
      // 1. fetch(url, {body: string}) at /api/anything/UUID
      await fetch('/api/anything/12345678-1234-1234-1234-1234567890ab', { method: 'POST', body: bodyStr });
      
      // 2. fetch(new Request(...)) at /api/f/conversation
      const req = new Request('/api/f/conversation', { method: 'POST', body: bodyStr });
      await fetch(req);
      
      // 3. fetch with Blob body at /api/other
      const blob = new Blob([bodyStr], { type: 'application/json' });
      await fetch('/api/other', { method: 'POST', body: blob });
      
      // 4. XHR at /api/xhr-path
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/xhr-path');
        xhr.onload = () => resolve();
        xhr.send(bodyStr);
      });
    }, createBody());

    // Wait a bit for requests to hit server
    await new Promise(r => setTimeout(r, 1000));

    expect(server.loggedRequests.length).toBe(4);
    for (const req of server.loggedRequests) {
      expect(req.body).toContain('«EMAIL_1»');
      expect(req.body).not.toContain(email);
    }

    const logStr = consoleLogs.join('\n');
    expect(logStr).toContain('Ratchet: interceptor installed');
    expect(logStr).toContain('Ratchet: POST /api/anything/:id -> redacted (style: fetch string URL)');
    expect(logStr).toContain('Ratchet: POST /api/f/conversation -> redacted (style: fetch with a Request object)');
    expect(logStr).toContain('Ratchet: POST /api/other -> redacted (style: fetch string URL)');
    expect(logStr).toContain('Ratchet: POST /api/xhr-path -> redacted (style: XHR)');
  });

  test('23: Real-site DOM shape restoration, URL change, split nodes, and code elements', async () => {
    const convId = 'temp-real-dom';
    await page.goto(`http://127.0.0.1:${PORT}/?c=${convId}`);
    await page.waitForLoadState('networkidle');
    server.clearLoggedRequests();

    const email = 'real.dom@example.com';
    const createBody = () => JSON.stringify({
      messages: [{
        author: { role: 'user' },
        content: { parts: [`Check ${email}`] }
      }]
    });

    // 1. Fire interceptor to create mapping under temp-real-dom
    await page.evaluate(async (bodyStr) => {
      await fetch('/api/f/conversation', { method: 'POST', body: bodyStr });
    }, createBody());

    await new Promise(r => setTimeout(r, 1000));
    expect(server.loggedRequests[0].body).toContain('«EMAIL_1»');

    // 2. Simulate URL change (history.pushState) to /c/uuid-5678
    // This tests the migrateConversationMapping fallback!
    await page.evaluate(() => {
      history.pushState({}, '', '/c/uuid-5678');
      // Trigger focus or mapping update event to ensure new mappings are fetched under new ID
      window.dispatchEvent(new Event('focus'));
    });
    
    // Wait for mapping update
    await new Promise(r => setTimeout(r, 500));

    // 3. Simulate the assistant streaming a response with split text nodes and inline code
    await page.evaluate(() => {
      // User bubble (split text nodes in same element)
      const userDiv = document.createElement('div');
      userDiv.className = 'user-bubble';
      userDiv.appendChild(document.createTextNode('You said: '));
      userDiv.appendChild(document.createTextNode('«EM'));
      userDiv.appendChild(document.createTextNode('AIL_1»'));
      document.body.appendChild(userDiv);

      // Assistant bubble with inline code
      const asstDiv = document.createElement('div');
      asstDiv.className = 'assistant-bubble markdown';
      asstDiv.innerHTML = `<p>The email is <code>«EMAIL_1»</code>.</p>`;
      document.body.appendChild(asstDiv);

      // Textarea input (should not be restored)
      const input = document.createElement('textarea');
      input.id = 'prompt-textarea-test23';
      input.value = 'Draft: «EMAIL_1»';
      document.body.appendChild(input);
    });

    // Wait for the mutation observer and rAF to do the restoration
    await new Promise(r => setTimeout(r, 1000));

    // Assert user bubble restored
    const userText = await page.evaluate(() => document.querySelector('.user-bubble')?.textContent);
    expect(userText).toContain(email);
    expect(userText).not.toContain('«EMAIL_1»');

    // Assert assistant bubble restored
    const asstText = await page.evaluate(() => document.querySelector('.assistant-bubble')?.textContent);
    expect(asstText).toContain(email);
    expect(asstText).not.toContain('«EMAIL_1»');

    // Assert input box untouched
    const inputValue = await page.evaluate(() => (document.querySelector('#prompt-textarea-test23') as HTMLTextAreaElement).value);
    expect(inputValue).toBe('Draft: «EMAIL_1»');
  });
});
