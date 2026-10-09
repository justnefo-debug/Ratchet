/**
 * Ratchet Privacy Shield — Dataset Downloader
 * Downloads approved raw datasets for gazetteer expansion:
 * 1. US Census Bureau Surnames (names.zip)
 * 2. SSA Given Names (baby-names.csv)
 * 3. GeoNames Cities with population > 15,000 (cities15000.zip)
 * 4. SEC EDGAR Company Tickers (company_tickers.json)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const downloadsDir = path.resolve(__dirname, '../data/downloads');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

async function downloadFile(url, destPath, headers = {}) {
  console.log(`Downloading: ${url} -> ${path.basename(destPath)}`);
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`Failed to download ${url}: ${resp.status} ${resp.statusText}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  const stats = fs.statSync(destPath);
  console.log(`✓ Saved ${path.basename(destPath)} (${(stats.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log('=== Starting Approved Dataset Downloads ===');

  // 1. US Census Surnames
  const censusZip = path.join(downloadsDir, 'census_names.zip');
  if (!fs.existsSync(censusZip)) {
    await downloadFile(
      'https://www2.census.gov/topics/genealogy/2010surnames/names.zip',
      censusZip,
      { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    );
  } else {
    console.log('✓ Census zip already exists');
  }

  // 2. SSA Given Names
  const ssaCsv = path.join(downloadsDir, 'ssa_baby_names.csv');
  if (!fs.existsSync(ssaCsv)) {
    await downloadFile(
      'https://raw.githubusercontent.com/hadley/data-baby-names/master/baby-names.csv',
      ssaCsv,
      { 'User-Agent': 'Mozilla/5.0' }
    );
  } else {
    console.log('✓ SSA baby names CSV already exists');
  }

  // 3. GeoNames Cities > 15,000
  const geoZip = path.join(downloadsDir, 'cities15000.zip');
  if (!fs.existsSync(geoZip)) {
    await downloadFile(
      'https://download.geonames.org/export/dump/cities15000.zip',
      geoZip,
      { 'User-Agent': 'Mozilla/5.0' }
    );
  } else {
    console.log('✓ GeoNames zip already exists');
  }

  // 4. SEC Company Tickers
  const secJson = path.join(downloadsDir, 'company_tickers.json');
  if (!fs.existsSync(secJson)) {
    await downloadFile(
      'https://www.sec.gov/files/company_tickers.json',
      secJson,
      { 'User-Agent': 'RatchetPrivacyProject/1.0 (contact@internal.ratchet.org)' }
    );
  } else {
    console.log('✓ SEC tickers JSON already exists');
  }

  console.log('=== All Approved Datasets Downloaded Successfully ===');
}

main().catch((err) => {
  console.error('Download error:', err);
  process.exit(1);
});
