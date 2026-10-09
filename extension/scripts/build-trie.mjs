/**
 * Ratchet Privacy Shield — Build-Time Trie Generator
 *
 * Compiles curated, openly licensed name, organization, and location lexicons
 * into a compact, pre-indexed Radix-Trie data structure.
 * Zero network access occurs at runtime or build time; all data is local.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 1. Lexicons ────────────────────────────────────────────────────────────
// Hand-curated seed lists of common names, prominent organizations, and
// major locations. Dedicated under CC0 1.0 (see NOTICE).

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
  // Western (US, European, Latin American)
  'sarah', 'john', 'alice', 'carlos', 'elena', 'david', 'michael', 'emma', 'james', 'robert',
  'mary', 'jennifer', 'alex', 'daniel', 'sophia', 'william', 'joseph', 'thomas', 'maria', 'luis',
  'sofia', 'mateo', 'lucas', 'olivia', 'liam', 'noah', 'oliver', 'charlotte', 'amelia', 'george',
  'harper', 'evelyn', 'benjamin', 'henry', 'alexander', 'sebastian', 'jack', 'sundance', 'sundar',
  'sundar', 'satya', 'tim', 'mark', 'jensen', 'sam', 'xavier', 'mikhail', 'elizabeth', 'anna'
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

// ─── 2. Trie Builder ────────────────────────────────────────────────────────

class TrieNode {
  constructor() {
    this.children = {};
    this.types = []; // Array of types matched at this terminal node
  }
}

function buildTrie() {
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

  // Insert lexicons
  for (const name of FIRST_NAMES) insert(name, 'FIRST_NAME');
  for (const name of LAST_NAMES) insert(name, 'LAST_NAME');
  for (const org of ORGANIZATIONS) insert(org, 'ORG');
  for (const loc of LOCATIONS) insert(loc, 'LOCATION');

  return root;
}

// ─── 3. Serialize and Write Data ────────────────────────────────────────────

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

console.log('Building Ratchet Gazetteer Trie...');
const trieRoot = buildTrie();
const serialized = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  counts: {
    firstNames: FIRST_NAMES.length,
    lastNames: LAST_NAMES.length,
    organizations: ORGANIZATIONS.length,
    locations: LOCATIONS.length,
  },
  trie: serializeTrie(trieRoot),
};

const outputPath = path.resolve(__dirname, '../src/detectors/gazetteer-data.json');
fs.writeFileSync(outputPath, JSON.stringify(serialized));
const stats = fs.statSync(outputPath);

console.log(`✓ Gazetteer Trie successfully written to: ${outputPath}`);
console.log(`  File size: ${(stats.size / 1024).toFixed(1)} KB`);
console.log(`  Entity Lexicon Totals:`);
console.log(`    - First Names:   ${FIRST_NAMES.length}`);
console.log(`    - Last Names:    ${LAST_NAMES.length}`);
console.log(`    - Organizations: ${ORGANIZATIONS.length}`);
console.log(`    - Locations:     ${LOCATIONS.length}`);
