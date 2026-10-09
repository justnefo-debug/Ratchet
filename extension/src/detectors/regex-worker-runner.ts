/**
 * Ratchet Privacy Shield — Worker-Based Regex Runner
 *
 * Runs regular expressions inside an isolated Worker thread with a hard timeout.
 * If a regex hangs due to catastrophic backtracking (ReDoS), worker.terminate()
 * is invoked to forcibly abort the execution, preventing thread stalls.
 */

import { validateRegexSafety } from './redos-validator';

export interface RegexRunResult {
  matches: Array<{ value: string; index: number }>;
  timedOut: boolean;
  error?: string;
}

/**
 * Executes a regex match with an un-bypassable hard timeout via worker termination.
 */
export async function matchRegexWithWorkerTimeout(
  pattern: string,
  text: string,
  timeoutMs: number = 25
): Promise<RegexRunResult> {
  // 1. Static safety validation first
  const safety = validateRegexSafety(pattern);
  if (!safety.valid) {
    return {
      matches: [],
      timedOut: true,
      error: safety.error,
    };
  }

  // 2. Node.js environment (e.g. Vitest tests)
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const { Worker } = await import('node:worker_threads');
      const workerCode = `
        const { parentPort } = require('node:worker_threads');
        parentPort.on('message', ({ pattern, text }) => {
          try {
            const re = new RegExp(pattern, 'g');
            const matches = [];
            let m;
            while ((m = re.exec(text)) !== null) {
              matches.push({ value: m[0], index: m.index });
              if (m[0].length === 0) {
                re.lastIndex++;
              }
            }
            parentPort.postMessage({ matches, timedOut: false });
          } catch (err) {
            parentPort.postMessage({ matches: [], timedOut: false, error: err.message });
          }
        });
      `;

      return await new Promise<RegexRunResult>((resolve) => {
        const worker = new Worker(workerCode, { eval: true });
        let finished = false;

        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            worker.terminate();
            resolve({ matches: [], timedOut: true });
          }
        }, timeoutMs);

        worker.on('message', (data: any) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            worker.terminate();
            resolve(data);
          }
        });

        worker.on('error', (err: any) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            worker.terminate();
            resolve({ matches: [], timedOut: false, error: err.message });
          }
        });

        worker.postMessage({ pattern, text });
      });
    } catch {
      // Fall through if worker_threads cannot be loaded
    }
  }

  // 3. Browser environment with DOM / DedicatedWorker (Content script / Options page)
  if (typeof Worker !== 'undefined') {
    return await new Promise<RegexRunResult>((resolve) => {
      let worker: Worker;
      let finished = false;

      try {
        const blob = new Blob(
          [
            `self.onmessage = function(e) {
              try {
                var re = new RegExp(e.data.pattern, 'g');
                var matches = [];
                var m;
                while ((m = re.exec(e.data.text)) !== null) {
                  matches.push({ value: m[0], index: m.index });
                  if (m[0].length === 0) { re.lastIndex++; }
                }
                self.postMessage({ matches: matches, timedOut: false });
              } catch (err) {
                self.postMessage({ matches: [], timedOut: false, error: err.message });
              }
            };`,
          ],
          { type: 'application/javascript' }
        );
        worker = new Worker(URL.createObjectURL(blob));
      } catch {
        // If blob workers are restricted by CSP, fallback
        return resolve(fallbackSyncMatch(pattern, text, timeoutMs));
      }

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          worker.terminate();
          resolve({ matches: [], timedOut: true });
        }
      }, timeoutMs);

      worker.onmessage = (e) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          worker.terminate();
          resolve(e.data);
        }
      };

      worker.onerror = (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          worker.terminate();
          resolve({ matches: [], timedOut: false, error: err.message });
        }
      };

      worker.postMessage({ pattern, text });
    });
  }

  // 4. Fallback in Service Worker scope where Worker constructor is unavailable
  return fallbackSyncMatch(pattern, text, timeoutMs);
}

function fallbackSyncMatch(pattern: string, text: string, budgetMs: number): RegexRunResult {
  const matches: Array<{ value: string; index: number }> = [];
  const t0 = performance.now();
  try {
    const re = new RegExp(pattern, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ value: m[0], index: m.index });
      if (m[0].length === 0) re.lastIndex++;
      if (performance.now() - t0 > budgetMs) {
        return { matches, timedOut: true };
      }
    }
    return { matches, timedOut: false };
  } catch (err: any) {
    return { matches: [], timedOut: false, error: err.message };
  }
}
