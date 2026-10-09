/**
 * Ratchet Privacy Shield — Non-Western Name Fetcher
 * Queries Wikidata (CC0 1.0 Universal) for verified given names and surnames
 * across South Asian, East Asian, Arabic/Middle Eastern, and African cultural/linguistic groups.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.resolve(__dirname, '../data/downloads/non_western_names.json');

async function queryWikidata(sparql) {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparql);
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'RatchetPrivacyShield/1.0 (contact@internal.ratchet.org)'
    }
  });
  if (!resp.ok) {
    throw new Error(`Wikidata SPARQL error: ${resp.status} ${resp.statusText}`);
  }
  const json = await resp.json();
  return json.results.bindings.map(b => b.name?.value).filter(Boolean);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRegion(regionName, countryQids, limitPerType = 500) {
  console.log(`Fetching names for ${regionName}...`);
  const countries = countryQids.map(q => `wd:${q}`).join(' ');

  // Given names
  const givenQuery = `
    SELECT DISTINCT ?name WHERE {
      VALUES ?country { ${countries} }
      ?item wdt:P31 wd:Q202444 ;
            wdt:P17 ?country ;
            rdfs:label ?name .
      FILTER(LANG(?name) = "en")
      FILTER(REGEX(?name, "^[A-Za-z\\\\-]+$"))
    } LIMIT ${limitPerType}
  `;

  // Surnames
  const surnameQuery = `
    SELECT DISTINCT ?name WHERE {
      VALUES ?country { ${countries} }
      ?item wdt:P31 wd:Q101352 ;
            wdt:P17 ?country ;
            rdfs:label ?name .
      FILTER(LANG(?name) = "en")
      FILTER(REGEX(?name, "^[A-Za-z\\\\-]+$"))
    } LIMIT ${limitPerType}
  `;

  let given = [];
  let surnames = [];

  try {
    given = await queryWikidata(givenQuery);
    console.log(`  ✓ ${regionName} given names: ${given.length}`);
  } catch (e) {
    console.warn(`  ⚠️ Could not fetch given names for ${regionName}:`, e.message);
  }

  await delay(1000);

  try {
    surnames = await queryWikidata(surnameQuery);
    console.log(`  ✓ ${regionName} surnames: ${surnames.length}`);
  } catch (e) {
    console.warn(`  ⚠️ Could not fetch surnames for ${regionName}:`, e.message);
  }

  await delay(1000);

  return { given, surnames };
}

async function main() {
  console.log('=== Fetching Non-Western Names from Wikidata (CC0) ===');

  const regions = [
    { name: 'South Asia', qids: ['Q668', 'Q843', 'Q902', 'Q854'] }, // India, Pakistan, Bangladesh, Sri Lanka
    { name: 'East Asia', qids: ['Q148', 'Q17', 'Q884', 'Q423', 'Q865'] }, // China, Japan, South Korea, North Korea, Taiwan
    { name: 'Middle East & Arabic', qids: ['Q79', 'Q851', 'Q878', 'Q794', 'Q810', 'Q801'] }, // Egypt, Saudi Arabia, UAE, Iran, Jordan, Israel
    { name: 'Africa', qids: ['Q1033', 'Q258', 'Q114', 'Q117', 'Q115', 'Q1009'] }, // Nigeria, South Africa, Kenya, Ghana, Ethiopia, Cameroon
  ];

  const allGiven = new Set();
  const allSurnames = new Set();

  for (const reg of regions) {
    const res = await fetchRegion(reg.name, reg.qids, 600);
    for (const g of res.given) allGiven.add(g);
    for (const s of res.surnames) allSurnames.add(s);
  }

  const outData = {
    source: 'Wikidata (CC0 1.0 Universal)',
    fetchedAt: new Date().toISOString(),
    firstNames: Array.from(allGiven),
    lastNames: Array.from(allSurnames),
  };

  fs.writeFileSync(outPath, JSON.stringify(outData, null, 2));
  console.log(`\n✓ Successfully saved non-Western names to: ${outPath}`);
  console.log(`  - First names: ${outData.firstNames.length}`);
  console.log(`  - Last names:  ${outData.lastNames.length}`);
}

main().catch(console.error);
