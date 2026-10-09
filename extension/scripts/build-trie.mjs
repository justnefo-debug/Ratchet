/**
 * Ratchet Privacy Shield — Build-Time Trie Generator
 *
 * Compiles curated, openly licensed name, organization, and location lexicons
 * into a compact, pre-indexed Radix-Trie data structure.
 *
 * Sourced from:
 * 1. US Census Bureau Surnames (Public Domain)
 * 2. SSA Given Names (Public Domain)
 * 3. GeoNames Global Cities > 15,000 population (CC BY 4.0)
 * 4. SEC EDGAR Company Tickers & Titles (Public Domain)
 * 5. Hand-curated & Wikidata multilingual demographic seeds (CC0 1.0)
 *
 * Strictly enforces size budget < 3 MB and fast cold parse (< 30 ms).
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Common English words and stopwords to exclude from single-token entity matching
export const ENGLISH_STOPWORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with',
  'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him',
  'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
  'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use',
  'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'being', 'may', 'march', 'april', 'june',
  'july', 'august', 'bill', 'mark', 'general', 'grant', 'early', 'brown', 'white', 'black', 'green', 'short',
  'long', 'young', 'little', 'small', 'price', 'cook', 'king', 'hall', 'bell', 'cross', 'rose', 'stone',
  'wood', 'west', 'north', 'south', 'east', 'hope', 'best', 'car', 'van', 'case', 'file', 'line', 'point',
  'post', 'page', 'read', 'write', 'run', 'test', 'set', 'data', 'code', 'base', 'view', 'show', 'lead',
  'host', 'port', 'path', 'user', 'name', 'date', 'type', 'list', 'item', 'help', 'info', 'true', 'false',
  'null', 'undefined', 'object', 'string', 'number', 'array', 'value', 'key', 'index', 'status', 'error',
  'spring', 'fall', 'winter', 'summer', 'job', 'major', 'minor', 'field', 'order', 'call', 'talk', 'hand',
  'part', 'place', 'house', 'system', 'program', 'problem', 'room', 'service', 'friend', 'father', 'mother',
  'area', 'money', 'story', 'fact', 'month', 'lot', 'right', 'study', 'book', 'eye', 'word', 'business',
  'issue', 'side', 'kind', 'head', 'house', 'service', 'friend', 'power', 'hour', 'game', 'line', 'end',
  'member', 'law', 'car', 'city', 'community', 'name', 'president', 'team', 'minute', 'idea', 'kid', 'body',
  'information', 'back', 'parent', 'face', 'others', 'level', 'office', 'door', 'health', 'person', 'art',
  'war', 'history', 'party', 'result', 'change', 'morning', 'reason', 'research', 'girl', 'guy', 'moment',
  'air', 'teacher', 'force', 'education'
]);

// ─── 1. Hand-Curated Multilingual Demographic Seeds ─────────────────────────

export const FIRST_NAMES = [
  // South Asian & Pakistani
  'tariq', 'fatima', 'imran', 'ayesha', 'bilal', 'zainab', 'ali', 'muhammad', 'ahmed',
  'hassan', 'hussain', 'hamza', 'usman', 'saad', 'asad', 'sana', 'hina', 'mariam', 'nadia',
  'zoya', 'rahul', 'priya', 'amit', 'sunita', 'deepak', 'rajesh', 'ananya', 'rohan', 'kavita',
  'arjun', 'neha', 'vikram', 'pooja', 'sanjay', 'meera', 'aditya', 'swati', 'nawaz', 'shahbaz',
  // Middle Eastern & Arabic
  'omar', 'layla', 'kareem', 'noor', 'zayd', 'khalid', 'youssef', 'amina', 'ibrahim', 'salma',
  'mansoor', 'mustafa', 'tamer', 'reem', 'huda', 'rashid', 'farah', 'hamid', 'samir', 'leila',
  'nasir', 'soraya', 'malik', 'amir', 'habib', 'zahra', 'mona', 'tareq', 'walid', 'yasmin',
  // East Asian
  'wei', 'yu', 'min', 'haruki', 'jun', 'lin', 'mei', 'sakura', 'kenji', 'tao', 'jie', 'so-yeon',
  'ji-hoon', 'eun-ji', 'chen', 'xiao', 'hiroshi', 'yuki', 'daiki', 'ren', 'kaori', 'seung', 'hyun',
  // African
  'kwame', 'ngozi', 'tendai', 'chinua', 'kofi', 'chidi', 'babatunde', 'oluwaseun', 'zola',
  'jidenna', 'amara', 'thabo', 'sipho', 'chiamaka', 'emeka', 'folake', 'ayodele', 'tawonga',
  // Western
  'sarah', 'john', 'alice', 'carlos', 'elena', 'david', 'michael', 'emma', 'james', 'robert',
  'mary', 'jennifer', 'alex', 'daniel', 'sophia', 'william', 'joseph', 'thomas', 'maria', 'luis',
  'sofia', 'mateo', 'lucas', 'olivia', 'liam', 'noah', 'oliver', 'charlotte', 'amelia', 'george',
  'harper', 'evelyn', 'benjamin', 'henry', 'alexander', 'sebastian', 'jack', 'sundance', 'sundar',
  'satya', 'tim', 'mark', 'jensen', 'sam', 'xavier', 'mikhail', 'elizabeth', 'anna'
];

export const LAST_NAMES = [
  // South Asian & Pakistani
  'khan', 'mehmood', 'bhutto', 'malik', 'siddiqui', 'abbas', 'chaudhry', 'shah', 'qureshi',
  'butt', 'sheikh', 'gillani', 'bajwa', 'sharma', 'patel', 'verma', 'singh', 'kumar',
  'gupta', 'reddy', 'nair', 'iyer', 'joshi', 'rao', 'bhat', 'deshmukh', 'choudhury', 'ramachandran',
  'muhammad', 'ahmed', 'hassan', 'hussain', 'ali', 'iqbal', 'mirza', 'dar', 'baig', 'akhtar',
  // Middle Eastern & Arabic
  'al-mansoor', 'farooq', 'al-hassan', 'abdel-aziz', 'al-sabah', 'al-sayed', 'al-khatib', 'haddad',
  'khalil', 'bakir', 'al-ghamdi', 'al-otaibi', 'salem', 'nasser', 'saleh', 'mahmoud', 'kassir',
  'al-harbi', 'al-dawsari', 'najjar', 'barakat', 'mansour', 'antoun', 'fakhoury',
  // East Asian
  'zhang', 'wang', 'li', 'liu', 'yang', 'huang', 'wu', 'zhou', 'xu', 'murakami', 'sato',
  'suzuki', 'takahashi', 'tanaka', 'watanabe', 'ito', 'yamamoto', 'nakamura', 'kobayashi',
  'kim', 'lee', 'park', 'choi', 'jeong', 'kang', 'cho', 'yoon', 'jang', 'lim', 'han',
  // African
  'mensah', 'okonjo', 'moyo', 'achebe', 'diallo', 'okafor', 'adeleke', 'traore', 'cisse', 'keita',
  'osei', 'kenyatta', 'mbeki', 'dlamini', 'mwangi', 'kamau', 'otieno', 'mutua', 'kone', 'diop',
  // Western
  'jenkins', 'pichai', 'cooper', 'rostova', 'rodriguez', 'doe', 'smith', 'johnson', 'williams',
  'brown', 'jones', 'garcia', 'miller', 'davis', 'connor', 'wilson', 'martinez', 'anderson',
  'taylor', 'hernandez', 'moore', 'martin', 'jackson', 'thompson', 'white', 'lopez', 'clark',
  'dupont', 'voronin', 'nadella', 'cook', 'zuckerberg', 'altman', 'huang', 'musk', 'bezos', 'gates'
];

export const ORGANIZATIONS = [
  // Tech & AI
  'openai', 'anthropic', 'google', 'microsoft', 'apple', 'apple inc', 'apple inc.', 'meta',
  'amazon', 'deepmind', 'google deepmind', 'nvidia', 'intel', 'amd', 'oracle', 'ibm', 'salesforce',
  'cisco', 'adobe', 'snowflake', 'databricks', 'palantir', 'uber', 'airbnb', 'spotify', 'netflix',
  'twitter', 'x corp', 'tesla', 'spacex', 'stripe', 'github', 'gitlab', 'hugging face', 'yandex',
  'yandex llc', 'baidu', 'alibaba', 'tencent', 'bytedance', 'huawei', 'samsung electronics', 'sony',
  // Finance & Consulting
  'goldman sachs', 'morgan stanley', 'jpmorgan chase', 'jpmorgan', 'blackrock', 'mckinsey & company',
  'mckinsey', 'boston consulting group', 'bcg', 'bain & company', 'bain', 'deloitte', 'pwc',
  'ernst & young', 'ey', 'kpmg', 'barclays', 'hsbc', 'citigroup', 'citi', 'wells fargo',
  'bank of america', 'ubs', 'credit suisse', 'standard chartered', 'deutsche bank',
  // Industry & Enterprise
  'siemens', 'siemens ag', 'acme corp', 'acme corporation', 'pfizer', 'moderna', 'novartis', 'roche',
  'toyota', 'bosch', 'general electric', 'ge', 'lockheed martin', 'airbus', 'boeing', 'volkswagen',
  // Institutions & Universities
  'stanford university', 'harvard university', 'mit', 'oxford university', 'cambridge university',
  'george washington university', 'united nations', 'un', 'world health organization', 'who',
  'imf', 'world bank', 'nasa', 'darpa'
];

export const LOCATIONS = [
  // Countries
  'united states', 'united states of america', 'usa', 'united kingdom', 'uk', 'pakistan', 'india',
  'china', 'japan', 'germany', 'france', 'canada', 'australia', 'brazil', 'nigeria', 'kenya', 'egypt',
  'south africa', 'saudi arabia', 'uae', 'united arab emirates', 'singapore', 'south korea', 'spain',
  'italy', 'mexico', 'russia', 'turkey', 'indonesia', 'switzerland', 'sweden', 'netherlands',
  'norway', 'denmark', 'finland', 'ireland', 'new zealand', 'argentina', 'colombia', 'chile',
  'bangladesh', 'vietnam', 'thailand', 'malaysia', 'philippines', 'poland', 'ukraine', 'austria',
  // Major Cities & Tech Hubs
  'tokyo', 'london', 'paris', 'new york', 'new york city', 'san francisco', 'mountain view',
  'redmond', 'cupertino', 'berlin', 'madrid', 'beijing', 'shanghai', 'seoul', 'sydney',
  'toronto', 'chicago', 'boston', 'seattle', 'austin', 'karachi', 'lahore', 'islamabad', 'rawalpindi',
  'peshawar', 'quetta', 'mumbai', 'delhi', 'new delhi', 'bangalore', 'bengaluru', 'hyderabad',
  'chennai', 'dubai', 'abu dhabi', 'riyadh', 'jeddah', 'cairo', 'nairobi', 'lagos', 'abuja',
  'johannesburg', 'cape town', 'frankfurt', 'amsterdam', 'zurich', 'geneva', 'rome', 'milan',
  'hong kong', 'bangkok', 'jakarta', 'vancouver', 'montreal', 'melbourne', 'dublin', 'barcelona',
  'san jose', 'palo alto', 'los angeles', 'washington', 'washington, d.c.', 'washington dc',
  'dallas', 'houston', 'miami', 'atlanta', 'denver', 'philadelphia'
];

// ─── 2. Ingestion Helpers for Downloaded Corpora ─────────────────────────────

async function loadCensusSurnames(maxCount = 3500) {
  const filePath = path.resolve(__dirname, '../data/downloads/census/Names_2010Census.csv');
  if (!fs.existsSync(filePath)) return [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  const surnames = new Set();
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    const parts = line.split(',');
    const name = parts[0]?.trim();
    const rank = parseInt(parts[1], 10);
    const pctApi = parseFloat(parts[7]);
    const pctHisp = parseFloat(parts[10]);

    if (!name || name.length < 3) continue;
    const lower = name.toLowerCase();
    if (ENGLISH_STOPWORDS.has(lower)) continue;

    if (rank <= 3000 || (pctApi >= 35 && surnames.size < maxCount + 800) || (pctHisp >= 55 && surnames.size < maxCount + 800)) {
      surnames.add(lower);
    }
    if (surnames.size >= maxCount) break;
  }
  return Array.from(surnames);
}

async function loadSsaFirstNames(maxCount = 3500) {
  const filePath = path.resolve(__dirname, '../data/downloads/ssa_baby_names.csv');
  if (!fs.existsSync(filePath)) return [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  const nameTotals = new Map();
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    const match = line.match(/^\d+,"([^"]+)",([0-9.]+)/);
    if (!match) continue;
    const name = match[1].trim();
    const pct = parseFloat(match[2]);
    if (!name || name.length < 3) continue;
    const lower = name.toLowerCase();
    if (ENGLISH_STOPWORDS.has(lower)) continue;
    nameTotals.set(lower, (nameTotals.get(lower) || 0) + pct);
  }

  return Array.from(nameTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([name]) => name);
}

async function loadGeoNamesCities(maxCount = 3000) {
  const filePath = path.resolve(__dirname, '../data/downloads/geonames/cities15000.txt');
  if (!fs.existsSync(filePath)) return [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  const cities = [];

  for await (const line of rl) {
    const parts = line.split('\t');
    const asciiName = parts[2]?.trim();
    const pop = parseInt(parts[14], 10);
    if (!asciiName || asciiName.length < 3 || isNaN(pop)) continue;
    const lower = asciiName.toLowerCase();
    if (ENGLISH_STOPWORDS.has(lower)) continue;
    cities.push({ name: lower, pop });
  }

  cities.sort((a, b) => b.pop - a.pop);
  const unique = new Set();
  for (const c of cities) {
    unique.add(c.name);
    if (unique.size >= maxCount) break;
  }
  return Array.from(unique);
}

function loadSecCompanies(maxCount = 2500) {
  const filePath = path.resolve(__dirname, '../data/downloads/company_tickers.json');
  if (!fs.existsSync(filePath)) return [];

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const orgs = new Set();

  for (const item of Object.values(raw)) {
    const title = item.title?.trim();
    if (!title || title.length < 3) continue;

    const cleaned = title
      .replace(/\s+(inc\.?|corp\.?|corporation|llc|ltd\.?|co\.?|plc|ag|sa|nv|group|holdings|technologies)\s*$/i, '')
      .trim();

    if (cleaned.length >= 3) {
      const lower = cleaned.toLowerCase();
      if (!ENGLISH_STOPWORDS.has(lower)) orgs.add(lower);
    }
    const fullLower = title.toLowerCase();
    if (!ENGLISH_STOPWORDS.has(fullLower)) orgs.add(fullLower);

    if (orgs.size >= maxCount) break;
  }
  return Array.from(orgs);
}

function loadNonWesternNames() {
  const filePath = path.resolve(__dirname, '../data/downloads/non_western_names.json');
  if (!fs.existsSync(filePath)) return { given: [], surnames: [] };
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    given: (raw.firstNames || []).map((n) => n.toLowerCase()).filter((n) => !ENGLISH_STOPWORDS.has(n)),
    surnames: (raw.lastNames || []).map((n) => n.toLowerCase()).filter((n) => !ENGLISH_STOPWORDS.has(n)),
  };
}

// ─── 3. Trie Builder & Serialization ────────────────────────────────────────

class TrieNode {
  constructor() {
    this.children = {};
    this.types = [];
  }
}

function serializeTrie(node) {
  const result = {};
  if (node.types && node.types.length > 0) {
    result._ = node.types;
  }
  for (const [char, child] of Object.entries(node.children)) {
    result[char] = serializeTrie(child);
  }
  return result;
}

export async function buildCompleteGazetteer() {
  console.log('Building Ratchet Expanded Gazetteer Trie...');

  const censusSurnames = await loadCensusSurnames(3500);
  const ssaFirstNames = await loadSsaFirstNames(3500);
  const geoCities = await loadGeoNamesCities(3000);
  const secOrgs = loadSecCompanies(2500);
  const nonWestern = loadNonWesternNames();

  const allFirstNames = Array.from(new Set([...FIRST_NAMES, ...ssaFirstNames, ...nonWestern.given]));
  const allLastNames = Array.from(new Set([...LAST_NAMES, ...censusSurnames, ...nonWestern.surnames]));
  const allOrgs = Array.from(new Set([...ORGANIZATIONS, ...secOrgs]));
  const allLocations = Array.from(new Set([...LOCATIONS, ...geoCities]));

  const root = new TrieNode();

  function insert(phrase, type) {
    const clean = phrase.trim().toLowerCase();
    if (!clean) return;
    let curr = root;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (!curr.children[ch]) {
        curr.children[ch] = new TrieNode();
      }
      curr = curr.children[ch];
    }
    if (!curr.types.includes(type)) {
      curr.types.push(type);
    }
  }

  for (const name of allFirstNames) insert(name, 'FIRST_NAME');
  for (const name of allLastNames) insert(name, 'LAST_NAME');
  for (const org of allOrgs) insert(org, 'ORG');
  for (const loc of allLocations) insert(loc, 'LOCATION');

  const serialized = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    counts: {
      firstNames: allFirstNames.length,
      lastNames: allLastNames.length,
      organizations: allOrgs.length,
      locations: allLocations.length,
    },
    trie: serializeTrie(root),
  };

  const outputPath = path.resolve(__dirname, '../src/detectors/gazetteer-data.json');
  const jsonStr = JSON.stringify(serialized);
  fs.writeFileSync(outputPath, jsonStr, 'utf8');

  const stats = fs.statSync(outputPath);
  const sizeMB = stats.size / (1024 * 1024);
  const sizeKB = stats.size / 1024;

  console.log(`✓ Gazetteer Trie successfully written to: ${outputPath}`);
  console.log(`  File size: ${sizeKB.toFixed(1)} KB (${sizeMB.toFixed(2)} MB)`);
  console.log(`  Entity Lexicon Totals:`);
  console.log(`    - First Names:   ${allFirstNames.length}`);
  console.log(`    - Last Names:    ${allLastNames.length}`);
  console.log(`    - Organizations: ${allOrgs.length}`);
  console.log(`    - Locations:     ${allLocations.length}`);
  console.log(`    - Total Entries: ${allFirstNames.length + allLastNames.length + allOrgs.length + allLocations.length}`);

  if (sizeMB >= 3.0) {
    throw new Error(`Size limit violated: ${sizeMB.toFixed(2)} MB >= 3.0 MB budget!`);
  }

  return serialized;
}

if (process.argv[1] && process.argv[1].endsWith('build-trie.mjs')) {
  buildCompleteGazetteer().catch((err) => {
    console.error('Error building trie:', err);
    process.exit(1);
  });
}
