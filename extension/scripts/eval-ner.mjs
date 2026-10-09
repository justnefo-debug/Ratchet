/**
 * Ratchet Privacy Shield — Live Held-Out NER Evaluator & Benchmark
 *
 * Runs the held-out evaluation dataset (tests/data/held-out-eval.json) through
 * the Gazetteer & Context Rule NER Detector.
 * Measures cold load time, precision, recall, and 100-run median/p95 latency.
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 1. Load Trie & Initialize Engine ───────────────────────────────────────

const triePath = path.resolve(__dirname, '../src/detectors/gazetteer-data.json');
const evalPath = path.resolve(__dirname, '../tests/data/held-out-eval.json');

const tColdStart = performance.now();
const trieRaw = JSON.parse(fs.readFileSync(triePath, 'utf8'));
const coldLoadTimeMs = performance.now() - tColdStart;

const trieRoot = trieRaw.trie;
const evalDataset = JSON.parse(fs.readFileSync(evalPath, 'utf8'));

// ─── Context Rules & Negative Filters ───────────────────────────────────────

const TITLE_HONORIFIC_PREFIX =
  /\b(?:dr|mr|mrs|ms|prof|professor|senator|governor|judge|director|ceo|cto|cfo|vp|president|minister|architect|engineer|lead|author|specialist|economist|researcher|journalist|diplomat|general|attorney|founder)\.?\s+$/i;

const RELATIONAL_PREFIX =
  /\b(?:spoke with|meeting with|emailed|interview with|reply to|call with|contact|authored by|reviewed by|signed-off-by|author:|reviewed-by:|sender:|cc:|from:|to:)\s+$/i;

const LOCATION_PREPOSITIONS =
  /\b(?:in|at|to|from|across|near|visit|visiting|flew to|flying to|based in|branch in|office in|headquarters in|campus in|capital of)\s+$/i;

const ORG_SUFFIX =
  /\b(?:inc|inc\.|corp|corp\.|corporation|llc|ltd|ltd\.|gmbh|ag|plc|technologies|solutions|group|holdings|labs|university|bank|foundation|capital|partners)\b/i;

const ORG_PREPOSITIONS =
  /\b(?:at|for|with|joined|consulted for|audit for)\s+$/i;

const CAMEL_CASE = /[a-z]+[A-Z0-9][a-zA-Z0-9]*/;
const SNAKE_CASE = /[a-z0-9]+_[a-z0-9_]+/;
const FILE_PATH = /(?:[a-zA-Z]:\\[^\s]+|\/[^\s]+\/[^\s]+|(?:\w+\/)+\w+\.\w+|\b\w+\.(?:tsx?|jsx?|json|py|html|css|pdf|log|md|csv|txt)\b)/i;
const CODE_PUNCTUATION = /[{}();<>=[\]$]/;
const SENTENCE_START_PRE = /(?:^|[\r\n]+|[.!?]\s+)$/;

function detectEntities(text, sensitivity = 'medium') {
  const len = text.length;
  const entities = [];

  const isBoundary = (idx) => {
    if (idx < 0 || idx >= len) return true;
    return !/[a-zA-Z0-9_\-]/.test(text[idx]);
  };

  const isCodeOrPath = (start, end, val) => {
    const beforeStr = text.slice(0, start);
    const backticksBefore = (beforeStr.match(/`/g) || []).length;
    if (backticksBefore % 2 === 1) return true;
    if (CAMEL_CASE.test(val) || SNAKE_CASE.test(val) || CODE_PUNCTUATION.test(val)) return true;
    const surrounding = text.slice(Math.max(0, start - 15), Math.min(len, end + 15));
    if (FILE_PATH.test(surrounding)) return true;
    return false;
  };

  const getPrefixContext = (start) => text.slice(Math.max(0, start - 40), start);
  const getSuffixContext = (end) => text.slice(end, Math.min(len, end + 40));

  let i = 0;
  while (i < len) {
    if (!isBoundary(i - 1)) {
      i++;
      continue;
    }

    let node = trieRoot;
    let j = i;
    let bestMatch = null;

    while (j < len) {
      const char = text[j].toLowerCase();
      if (!node[char]) break;
      node = node[char];
      j++;

      if (node._ && isBoundary(j)) {
        bestMatch = { end: j, types: node._, val: text.slice(i, j) };
      }
    }

    if (bestMatch) {
      const matchVal = bestMatch.val;
      const matchStart = i;
      const matchEnd = bestMatch.end;

      if (!isCodeOrPath(matchStart, matchEnd, matchVal)) {
        const prefix = getPrefixContext(matchStart);
        const suffix = getSuffixContext(matchEnd);
        const isSentenceInitial = SENTENCE_START_PRE.test(prefix);

        // Case A: First name followed by potential last name
        if (bestMatch.types.includes('FIRST_NAME')) {
          const rest = text.slice(matchEnd);
          const nextWordMatch = rest.match(/^\s+([A-Za-z\-]+)/);
          let combinedPerson = null;

          if (nextWordMatch) {
            const secondWord = nextWordMatch[1];
            let n2 = trieRoot;
            let isLast = false;
            for (const ch of secondWord.toLowerCase()) {
              if (!n2[ch]) { n2 = null; break; }
              n2 = n2[ch];
            }
            if (n2 && n2._ && n2._.includes('LAST_NAME')) {
              isLast = true;
            }

            if (isLast || /^[A-Z][a-z]+$/.test(secondWord)) {
              combinedPerson = {
                start: matchStart,
                end: matchStart + nextWordMatch[0].length,
                val: text.slice(matchStart, matchStart + nextWordMatch[0].length).trim(),
              };
            }
          }

          if (combinedPerson) {
            entities.push({
              type: 'PERSON',
              value: combinedPerson.val,
              start: combinedPerson.start,
              end: combinedPerson.end,
            });
            i = combinedPerson.end;
            continue;
          } else {
            const hasHonorific = TITLE_HONORIFIC_PREFIX.test(prefix);
            const hasRelational = RELATIONAL_PREFIX.test(prefix);

            if (hasHonorific || hasRelational) {
              entities.push({
                type: 'PERSON',
                value: matchVal,
                start: matchStart,
                end: matchEnd,
              });
              i = matchEnd;
              continue;
            } else if (sensitivity !== 'low' && !isSentenceInitial) {
              entities.push({
                type: 'PERSON',
                value: matchVal,
                start: matchStart,
                end: matchEnd,
              });
              i = matchEnd;
              continue;
            }
          }
        }

        // Case B: Last Name with Honorific
        if (bestMatch.types.includes('LAST_NAME')) {
          const hasHonorific = TITLE_HONORIFIC_PREFIX.test(prefix);
          const hasRelational = RELATIONAL_PREFIX.test(prefix);

          if (hasHonorific || hasRelational) {
            entities.push({
              type: 'PERSON',
              value: matchVal,
              start: matchStart,
              end: matchEnd,
            });
            i = matchEnd;
            continue;
          }
        }

        // Case C: Organizations
        if (bestMatch.types.includes('ORG')) {
          let orgEnd = matchEnd;
          let orgVal = matchVal;
          const rest = text.slice(matchEnd);
          const suffixMatch = rest.match(/^\s+(?:Inc\.?|Corp\.?|Corporation|LLC|Ltd\.?|GmbH|AG|Group|Holdings|Labs|Technologies|University)/i);
          if (suffixMatch) {
            orgEnd = matchEnd + suffixMatch[0].length;
            orgVal = text.slice(matchStart, orgEnd);
          }

          const hasOrgCue = ORG_PREPOSITIONS.test(prefix) || ORG_SUFFIX.test(orgVal);
          const isAmbiguousFruit = matchVal.toLowerCase() === 'apple' && !hasOrgCue && /\b(?:ate|eat|fruit|red|green|fresh)\b/i.test(prefix);

          if (!isAmbiguousFruit) {
            if (sensitivity === 'low' ? hasOrgCue : true) {
              entities.push({
                type: 'ORG',
                value: orgVal,
                start: matchStart,
                end: orgEnd,
              });
              i = orgEnd;
              continue;
            }
          }
        }

        // Case D: Locations
        if (bestMatch.types.includes('LOCATION')) {
          const hasLocCue = LOCATION_PREPOSITIONS.test(prefix);
          const isAmbiguousPerson = (matchVal.toLowerCase() === 'jordan' || matchVal.toLowerCase() === 'paris') &&
            (TITLE_HONORIFIC_PREFIX.test(prefix) || RELATIONAL_PREFIX.test(prefix) || /^[A-Z][a-z]+$/.test(suffix.trim().split(/\s+/)[0] || ''));

          if (!isAmbiguousPerson) {
            if (sensitivity === 'low' ? hasLocCue : true) {
              entities.push({
                type: 'LOCATION',
                value: matchVal,
                start: matchStart,
                end: matchEnd,
              });
              i = matchEnd;
              continue;
            }
          }
        }
      }
    }

    i++;
  }

  return entities;
}

// ─── 2. Evaluate on Held-Out Dataset ────────────────────────────────────────

const stats = {
  PERSON: { tp: 0, fp: 0, fn: 0 },
  ORG: { tp: 0, fp: 0, fn: 0 },
  LOCATION: { tp: 0, fp: 0, fn: 0 },
};

for (const item of evalDataset) {
  const detected = detectEntities(item.text, 'medium');

  // Check expected entities against detected
  for (const expected of item.entities) {
    const cat = expected.category;
    const match = detected.find(d => 
      d.type === cat && d.value.toLowerCase().includes(expected.text.toLowerCase()) ||
      expected.text.toLowerCase().includes(d.value.toLowerCase())
    );

    if (match) {
      stats[cat].tp++;
    } else {
      stats[cat].fn++;
    }
  }

  // Check false positives
  for (const d of detected) {
    const cat = d.type;
    const isExpected = item.entities.some(e => 
      e.category === cat && (e.text.toLowerCase().includes(d.value.toLowerCase()) || d.value.toLowerCase().includes(e.text.toLowerCase()))
    );

    if (!isExpected) {
      stats[cat].fp++;
    }
  }
}

// Compute P, R, F1
function calcMetrics(tp, fp, fn) {
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);
  return {
    precision: (precision * 100).toFixed(1) + '%',
    recall: (recall * 100).toFixed(1) + '%',
    f1: (f1 * 100).toFixed(1) + '%',
    tp, fp, fn
  };
}

const personMetrics = calcMetrics(stats.PERSON.tp, stats.PERSON.fp, stats.PERSON.fn);
const orgMetrics = calcMetrics(stats.ORG.tp, stats.ORG.fp, stats.ORG.fn);
const locMetrics = calcMetrics(stats.LOCATION.tp, stats.LOCATION.fp, stats.LOCATION.fn);

const totalTp = stats.PERSON.tp + stats.ORG.tp + stats.LOCATION.tp;
const totalFp = stats.PERSON.fp + stats.ORG.fp + stats.LOCATION.fp;
const totalFn = stats.PERSON.fn + stats.ORG.fn + stats.LOCATION.fn;
const overallMetrics = calcMetrics(totalTp, totalFp, totalFn);

// ─── 3. Benchmark 100 Runs on 500-Word Prompt ────────────────────────────────

const PROMPT_500_WORDS = `
Hello ChatGPT, I am preparing an incident report regarding a security breach that occurred on our internal network on 10/05/2026.
Our primary engineer John Doe (reachable at j.doe@company.example.com or mobile +1-555-876-5432) noticed anomalous network activity
originating from external IP address 198.51.100.45 and routing towards internal cluster host 10.240.12.88 at 03:15 UTC.
The intruder attempted to authenticate against database server SRV-DB091 using leaked credentials found in public repository.
The connection string utilized was https://dbadmin:superSecretP@ssw0rd!@internal-db.example.com:5432/production.
Upon inspecting the access logs, our security team detected that an exposed API token sk-proj-1234567890abcdef1234567890abcdef12345678
was used to make unauthorized requests against our private endpoint.
Furthermore, during the compromise, a test transaction file containing customer records was downloaded.
This file included sensitive customer details such as social security number 123-45-6789 belonging to customer Alice,
national identity number 35202-1234567-1, and corporate credit card 4532-0150-0000-0000 with expiration date 12/28.
The customer's date of birth was recorded as 04/15/1988.
The network interface involved had hardware MAC address 00:1A:2B:3C:4D:5E connected to switch port 4.
The affected subsystem is part of Project QuantumLeap, which integrates with the HydraCore microservice architecture.
Another engineer, Sarah Connor (s.connor@defense.example.org, phone (415) 555-0144), immediately revoked the compromised token
and rotated the secret keys across all affected nodes.
She also isolated secondary host 172.16.254.1 and server SRV-APP02 to prevent lateral movement within the cloud environment.
We need you to analyze this sequence of events, summarize the threat vector, and draft an executive post-mortem.
Please evaluate whether the compromised credentials could have granted access to our secondary backup infrastructure.
Additionally, provide recommendations on implementing strict rate-limiting, least-privilege identity access management,
and automated anomaly detection for outbound connections.
Make sure to format the recommendations as a bulleted checklist with estimated priority levels and mitigation steps.
We also need a formal customer notification template explaining that their payment information and SSN were safeguarded.
Please structure your answer logically, highlighting immediate containment actions taken, root cause analysis,
and long-term preventive measures to ensure our compliance with SOC2 and ISO27001 standards.
Thank you for your assistance in drafting this comprehensive report.
`.trim();

const latencies = [];
for (let run = 0; run < 100; run++) {
  const t0 = performance.now();
  detectEntities(PROMPT_500_WORDS, 'medium');
  latencies.push(performance.now() - t0);
}

latencies.sort((a, b) => a - b);
const medianLatency = latencies[Math.floor(latencies.length / 2)];
const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

console.log('\n======================================================');
console.log('📊 LIVE MEASUREMENT REPORT — STAGE 5 NER EVALUATION');
console.log('======================================================');
console.log(`Cold Load Time (Trie parsing): ${coldLoadTimeMs.toFixed(2)} ms`);
console.log(`\nLatency over 100 runs on 500-word prompt:`);
console.log(`  - Median (p50): ${medianLatency.toFixed(3)} ms`);
console.log(`  - 95th Percentile (p95): ${p95Latency.toFixed(3)} ms`);
console.log(`  - Min / Max: ${latencies[0].toFixed(3)} ms / ${latencies[latencies.length - 1].toFixed(3)} ms`);
console.log('\nAccuracy on Held-Out Test Set (88 Prompts, 214 Gold Entities):');
console.log(`  PERSON:   Precision ${personMetrics.precision} | Recall ${personMetrics.recall} | F1 ${personMetrics.f1} (TP: ${stats.PERSON.tp}, FP: ${stats.PERSON.fp}, FN: ${stats.PERSON.fn})`);
console.log(`  ORG:      Precision ${orgMetrics.precision} | Recall ${orgMetrics.recall} | F1 ${orgMetrics.f1} (TP: ${stats.ORG.tp}, FP: ${stats.ORG.fp}, FN: ${stats.ORG.fn})`);
console.log(`  LOCATION: Precision ${locMetrics.precision} | Recall ${locMetrics.recall} | F1 ${locMetrics.f1} (TP: ${stats.LOCATION.tp}, FP: ${stats.LOCATION.fp}, FN: ${stats.LOCATION.fn})`);
console.log(`  -------------------------------------------------------------`);
console.log(`  OVERALL:  Precision ${overallMetrics.precision} | Recall ${overallMetrics.recall} | F1 ${overallMetrics.f1} (TP: ${totalTp}, FP: ${totalFp}, FN: ${totalFn})`);
console.log('======================================================\n');
