#!/usr/bin/env node
/**
 * Convert UPPLY-SEAPORTS.csv → data/ports.json
 *
 * CSV schema  : code / name / latitude / longitude / country_code / zone_code
 * JSON schema : { "standardization": { "Standard Name": [ "Name CC", "CCNAME", "LOCODE" ] } }
 *
 * For each port we produce three idiomatic variants:
 *   1. "<name> <CC>"          e.g. "Abu Dhabi AE"
 *   2. "<CC><unlocode.suffix>" e.g. "AEAUH"
 *   3. the UN/LOCODE itself    e.g. "AEJEA"
 * The "standard" key is just the port's plain name.
 */

const fs   = require('fs');
const path = require('path');

const CSV_PATH = path.join(require('os').homedir(), 'Desktop', 'UPPLY-SEAPORTS.csv');
const OUT_PATH = path.join(process.cwd(), 'data', 'ports.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function parseCSV(raw) {
  const [hdr, ...body] = raw.trim().split(/\r?\n/);
  const cols = hdr.split(';');
  return body.map(line => {
    const vals = line.split(';');
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  });
}

/** Return a clean 3-char Country abbreviation from country_code (e.g. "AE", "DE") */
function cc3(code) {
  return String(code || '').toUpperCase().trim();
}

/** Port name without diacritics for variant spelling */
function stripAccent(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── main ─────────────────────────────────────────────────────────────────────

const raw = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parseCSV(raw);

// Group by standard name (may have multiple entries differing only by zone/code)  
const byName = new Map();
rows.forEach(row => {
  const name = (row.name || '').trim();
  if (!name) return;
  const code  = (row.code  || '').trim().toUpperCase();
  const cc    = cc3(row.country_code);

  if (!byName.has(name)) byName.set(name, new Set());

  const entry = byName.get(name);

  // variant 1 : "Abu Dhabi AE"
  if (cc)   entry.add(`${name} ${cc}`);
  // variant 2 : "AEAUH" (the LOCODE itself)
  if (code) entry.add(code);
  // variant 3 : strip accents if different
  const stripped = stripAccent(name);
  if (stripped !== name) entry.add(stripped);
});

// Build the standardisation object
const standardization = {};
byName.forEach((variants, name) => {
  standardization[name] = Array.from(variants);
});

const result = { standardization };

fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf8');

const keys = Object.keys(standardization);
const totalVariants = keys.reduce((a, k) => a + standardization[k].length, 0);

console.log(`[GSXR404] Wrote ${OUT_PATH}`);
console.log(`         ports   : ${keys.length}`);
console.log(`         variants: ${totalVariants} (avg ${(totalVariants/keys.length).toFixed(1)} per port)`);
