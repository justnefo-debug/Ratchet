/**
 * Ratchet Privacy Shield — Gazetteer & Context Rule NER Backend
 *
 * Implements local, offline Named Entity Recognition for:
 * - PERSON   («PERSON_1»)
 * - ORG      («ORG_1»)
 * - LOCATION («LOCATION_1»)
 *
 * Architecture:
 * - Lazy-loaded Radix-Trie compiled at build-time from openly licensed lexicons (NOTICE).
 * - Morphosyntactic & relational context cues for high precision.
 * - Negative filters: code identifiers, file paths, sentence-initial stopwords.
 * - Sensitivity mapping: low, medium, high.
 */

import type { DetectedEntity, Sensitivity } from '../shared/types';
import type { NerBackend, NerBackendOptions } from './ner-backend';
import gazetteerRaw from './gazetteer-data.json';

// ─── Caching & Lazy Loading ─────────────────────────────────────────────────

let cachedTrie: any = null;
let coldLoadTimeMs: number = 0;

export async function loadGazetteerTrie() {
  if (!cachedTrie) {
    const t0 = performance.now();
    cachedTrie = gazetteerRaw;
    coldLoadTimeMs = performance.now() - t0;
  }
  return cachedTrie;
}

export function getColdLoadTimeMs(): number {
  return coldLoadTimeMs;
}

// ─── Regex Filters & Context Patterns ───────────────────────────────────────

// Context cues
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

// Negative filters: code identifiers must be full tokens
const CAMEL_CASE = /^[a-z]+[A-Z0-9][a-zA-Z0-9]*$/;
const SNAKE_CASE = /^[a-z0-9]+_[a-z0-9_]+$/;
const FILE_PATH = /(?:[a-zA-Z]:\\[^\s]+|\/[^\s]+\/[^\s]+|(?:\w+\/)+\w+\.\w+|\b\w+\.(?:tsx?|jsx?|json|py|html|css|pdf|log|md|csv|txt)\b)/i;
const CODE_PUNCTUATION = /[{}();<>=[\]$]/;

// Sentence boundary check: preceded by start of string, newline, or punctuation + space
const SENTENCE_START_PRE = /(?:^|[\r\n]+|[.!?]\s+)$/;

// ─── Gazetteer NER Backend ──────────────────────────────────────────────────

export class GazetteerRuleNerBackend implements NerBackend {
  readonly name = 'gazetteer-rules';

  async detect(text: string, options?: NerBackendOptions): Promise<DetectedEntity[]> {
    if (!text || text.trim() === '') return [];

    const sensitivity: Sensitivity = options?.sensitivity || 'medium';
    const enabledTypes = {
      person: options?.enabledTypes?.person !== false,
      org: options?.enabledTypes?.org !== false,
      location: options?.enabledTypes?.location !== false,
    };

    const trieData = await loadGazetteerTrie();
    const trieRoot = trieData.trie;

    const entities: DetectedEntity[] = [];
    const len = text.length;

    // Helper: test if character is a word boundary
    const isBoundary = (idx: number) => {
      if (idx < 0 || idx >= len) return true;
      return !/[a-zA-Z0-9_\-]/.test(text[idx]);
    };

    // Helper: check if substring is in code context or file path
    const isCodeOrPath = (start: number, end: number, val: string) => {
      // 1. Inside backticks
      const beforeStr = text.slice(0, start);
      const backticksBefore = (beforeStr.match(/`/g) || []).length;
      if (backticksBefore % 2 === 1) return true;

      // 2. Contains code syntax or snake/camelcase
      if (CAMEL_CASE.test(val) || SNAKE_CASE.test(val) || CODE_PUNCTUATION.test(val)) return true;

      // 3. Surrounded by path tokens
      const surroundingContext = text.slice(Math.max(0, start - 15), Math.min(len, end + 15));
      if (FILE_PATH.test(surroundingContext)) return true;

      return false;
    };

    // Helper: inspect context preceding a match position
    const getPrefixContext = (start: number) => {
      return text.slice(Math.max(0, start - 40), start);
    };

    // Helper: inspect context following a match position
    const getSuffixContext = (end: number) => {
      return text.slice(end, Math.min(len, end + 40));
    };

    // 1. Scan text with Trie matching
    let i = 0;
    while (i < len) {
      if (!isBoundary(i - 1)) {
        i++;
        continue;
      }

      // Traverse Trie starting at index i
      let node = trieRoot;
      let j = i;
      let bestMatch: { end: number; types: string[]; val: string } | null = null;

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

        // Apply negative filters
        if (!isCodeOrPath(matchStart, matchEnd, matchVal)) {
          const prefix = getPrefixContext(matchStart);
          const suffix = getSuffixContext(matchEnd);
          const isSentenceInitial = SENTENCE_START_PRE.test(prefix);

          // Evaluate Types
          // Case A: First name followed by potential last name
          if (bestMatch.types.includes('FIRST_NAME')) {
            // Check if followed by a second word
            const rest = text.slice(matchEnd);
            const nextWordMatch = rest.match(/^\s+([A-Za-z\-]+)/);
            let combinedPerson: { start: number; end: number; val: string } | null = null;

            if (nextWordMatch) {
              const secondWord = nextWordMatch[1];
              // Traverse trie for second word to check if it's a LAST_NAME
              let n2 = trieRoot;
              let isLast = false;
              for (const ch of secondWord.toLowerCase()) {
                if (!n2[ch]) { n2 = null; break; }
                n2 = n2[ch];
              }
              if (n2 && n2._ && n2._.includes('LAST_NAME')) {
                isLast = true;
              }

              // Also accept capitalized second word if not sentence start
              if (isLast || /^[A-Z][a-z]+$/.test(secondWord)) {
                const totalVal = text.slice(matchStart, matchEnd + nextWordMatch[0].length);
                combinedPerson = {
                  start: matchStart,
                  end: matchStart + nextWordMatch[0].length + (secondWord.length - nextWordMatch[1].length),
                  val: totalVal.trim(),
                };
              }
            }

            if (combinedPerson && enabledTypes.person) {
              entities.push({
                type: 'PERSON',
                value: combinedPerson.val,
                start: combinedPerson.start,
                end: combinedPerson.end,
                confidence: 0.95,
                source: 'ner',
              });
              i = combinedPerson.end;
              continue;
            } else if (enabledTypes.person) {
              // Single first name: check for context cues or medium/high sensitivity
              const hasHonorific = TITLE_HONORIFIC_PREFIX.test(prefix);
              const hasRelational = RELATIONAL_PREFIX.test(prefix);

              if (hasHonorific || hasRelational) {
                entities.push({
                  type: 'PERSON',
                  value: matchVal,
                  start: matchStart,
                  end: matchEnd,
                  confidence: 0.9,
                  source: 'ner',
                });
                i = matchEnd;
                continue;
              } else if (sensitivity !== 'low' && !isSentenceInitial) {
                // If not sentence initial and medium/high
                entities.push({
                  type: 'PERSON',
                  value: matchVal,
                  start: matchStart,
                  end: matchEnd,
                  confidence: 0.75,
                  source: 'ner',
                });
                i = matchEnd;
                continue;
              }
            }
          }

          // Case B: Last Name with Honorific (e.g. "Dr. Mehmood", "Mr. Khan", "General Washington")
          if (bestMatch.types.includes('LAST_NAME') && enabledTypes.person) {
            const hasHonorific = TITLE_HONORIFIC_PREFIX.test(prefix);
            const hasRelational = RELATIONAL_PREFIX.test(prefix);

            if (hasHonorific || hasRelational) {
              entities.push({
                type: 'PERSON',
                value: matchVal,
                start: matchStart,
                end: matchEnd,
                confidence: 0.9,
                source: 'ner',
              });
              i = matchEnd;
              continue;
            }
          }

          // Case C: Organizations
          if (bestMatch.types.includes('ORG') && enabledTypes.org) {
            // Check for attached org suffixes (e.g. "Apple Inc.", "Siemens AG")
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
                  confidence: 0.95,
                  source: 'ner',
                });
                i = orgEnd;
                continue;
              }
            }
          }

          // Case D: Locations
          if (bestMatch.types.includes('LOCATION') && enabledTypes.location) {
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
                  confidence: 0.95,
                  source: 'ner',
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

    // 2. High sensitivity: also detect capitalized multi-word sequences not at sentence start
    if (sensitivity === 'high') {
      const properNounRegex = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\b/g;
      let m: RegExpExecArray | null;
      while ((m = properNounRegex.exec(text)) !== null) {
        const val = m[1];
        const start = m.index;
        const end = start + val.length;

        // Skip if already covered by an existing entity
        const alreadyCovered = entities.some(e => !(end <= e.start || start >= e.end));
        if (alreadyCovered) continue;

        const prefix = getPrefixContext(start);
        if (SENTENCE_START_PRE.test(prefix)) continue;
        if (isCodeOrPath(start, end, val)) continue;

        // Classify based on cues
        if (ORG_SUFFIX.test(val) && enabledTypes.org) {
          entities.push({
            type: 'ORG',
            value: val,
            start,
            end,
            confidence: 0.7,
            source: 'ner',
          });
        } else if (LOCATION_PREPOSITIONS.test(prefix) && enabledTypes.location) {
          entities.push({
            type: 'LOCATION',
            value: val,
            start,
            end,
            confidence: 0.7,
            source: 'ner',
          });
        } else if (enabledTypes.person) {
          entities.push({
            type: 'PERSON',
            value: val,
            start,
            end,
            confidence: 0.7,
            source: 'ner',
          });
        }
      }
    }

    // Sort entities by start position
    entities.sort((a, b) => a.start - b.start);
    return entities;
  }
}
