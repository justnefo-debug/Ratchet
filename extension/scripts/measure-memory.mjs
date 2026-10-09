import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extPath = path.resolve(__dirname, '../dist-test');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-mem-profile-'));

async function run() {
  const context = await chromium.launchPersistentContext(tempDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-sandbox',
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

  const page = await context.newPage();
  const pageClient = await context.newCDPSession(page);
  await pageClient.send('Performance.enable');

  // Query all targets from Chrome CDP to find service worker
  const targets = await pageClient.send('Target.getTargets');
  const swTarget = targets.targetInfos.find((t) => t.type === 'service_worker');

  let swHeapUsedInit = 0;
  let swHeapTotalInit = 0;
  let swSessionId = null;

  if (swTarget) {
    const attachRes = await pageClient.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });
    swSessionId = attachRes.sessionId;
    // We can query target performance if supported
  }
  const extensionId = worker.url().split('/')[2];
  const testPageUrl = `chrome-extension://${extensionId}/src/options/options.html`;
  await page.goto(testPageUrl);
  await page.waitForLoadState('domcontentloaded');

  // Trigger redaction in SW to ensure NER and gazetteer are fully loaded
  await page.evaluate(async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'redact',
          text: 'Dr. Tariq Mehmood met with OpenAI representatives in Tokyo.',
          conversationId: 'mem-conv',
          siteOrigin: 'http://localhost',
        },
        resolve
      );
    });
  });

  // Query OS-level Chrome processes
  let chromeProcesses = [];
  try {
    const psOut = execSync(
      'powershell -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | Select-Object Id, WorkingSet64, PrivateMemorySize64 | ConvertTo-Json"',
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(psOut);
    chromeProcesses = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {}

  // 1. Evaluate memory directly inside the ServiceWorkerGlobalScope
  const swMemoryDirect = await worker.evaluate(() => {
    const mem = (performance && (performance).memory) ? {
      usedJSHeapSize: (performance).memory.usedJSHeapSize,
      totalJSHeapSize: (performance).memory.totalJSHeapSize,
      jsHeapSizeLimit: (performance).memory.jsHeapSizeLimit,
    } : null;
    return mem;
  });

  const swHeapUsedPost = swMemoryDirect?.usedJSHeapSize || 0;
  const swHeapTotalPost = swMemoryDirect?.totalJSHeapSize || 0;

  // 3. Web Page Tab Context Heap
  const pageMetrics = await pageClient.send('Performance.getMetrics');
  const pageHeapUsed = pageMetrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value || 0;
  const pageHeapTotal = pageMetrics.metrics.find((m) => m.name === 'JSHeapTotalSize')?.value || 0;

  const totalWorkingSet = chromeProcesses.reduce((acc, p) => acc + (p.WorkingSet64 || 0), 0);
  const totalPrivateMemory = chromeProcesses.reduce((acc, p) => acc + (p.PrivateMemorySize64 || 0), 0);

  console.log('\n======================================================');
  console.log('📊 DETAILED MEMORY BREAKDOWN (REAL MEASUREMENTS)');
  console.log('======================================================');
  console.log('1. Web Page Tab Context (Renderer Process Hosting Content Script / Chat DOM):');
  console.log(`   - JSHeapUsedSize:                  ${(pageHeapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - JSHeapTotalSize:                 ${(pageHeapTotal / (1024 * 1024)).toFixed(2)} MB`);
  console.log('\n2. Total Chrome Browser & Extension Process Footprint (OS-level):');
  console.log(`   - Chrome Processes Active:         ${chromeProcesses.length}`);
  console.log(`   - Combined WorkingSet (RAM):       ${(totalWorkingSet / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Combined Private Memory:         ${(totalPrivateMemory / (1024 * 1024)).toFixed(2)} MB`);
  for (const p of chromeProcesses) {
    console.log(`     * PID ${p.Id}: WorkingSet ${(p.WorkingSet64 / (1024 * 1024)).toFixed(2)} MB | Private ${(p.PrivateMemorySize64 / (1024 * 1024)).toFixed(2)} MB`);
  }
  console.log('\n3. Provenance of the 4.46 MB Figure:');
  console.log('   - The 4.46 MB figure previously measured by CDP `Performance.getMetrics`');
  console.log('     represented the JavaScript Heap Used (`JSHeapUsedSize`) of the ACTIVE TAB');
  console.log('     (the web page renderer process hosting the chat DOM + content script),');
  console.log('     NOT the background service worker or the entire Chrome process.');
  console.log('   - The total extension runtime (background SW process + renderer) requires');
  console.log(`     ~${(totalPrivateMemory / (1024 * 1024)).toFixed(0)} MB of OS private memory across all Chromium helper processes.`);
  console.log('======================================================\n');

  await context.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
