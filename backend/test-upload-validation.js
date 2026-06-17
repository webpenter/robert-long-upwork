'use strict';
// Smoke test for validateParsedRows — runs without MongoDB or file I/O.
// Usage (from project root): node backend/test-upload-validation.js

const { validateParsedRows } = require('./src/services/csvParser');

let allPassed = true;

function check(label, condition, detail) {
  if (!condition) {
    console.error(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
    allPassed = false;
  } else {
    console.log(`  PASS  ${label}${detail ? ': ' + detail : ''}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEndpointRow(sampleId, replicate, rfu, sampleClass) {
  return {
    Sample_ID: sampleId,
    Replicate: String(replicate),
    Raw_Fluorescence_RFU: String(rfu),
    Sample_Class: sampleClass || 'Library_Variant',
    Well: `A${replicate}`,
  };
}

function makeKineticRow(sampleId, replicate, tempC, timeMin, rfu) {
  return {
    Sample_ID: sampleId,
    Replicate: String(replicate),
    Temperature_C: String(tempC),
    Time_min: String(timeMin),
    Fluorescence_RFU: String(rfu),
    Well: `A${replicate}`,
  };
}

// ── Test 1: Clean plate-reader upload — no warnings ───────────────────────────
console.log('\nTest 1: clean PLATE_READER_ENDPOINT with reference + 3 replicates');
const cleanRows = [
  makeEndpointRow('WT_HSFAST_FUSION', 1, 5000, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION', 2, 5100, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION', 3, 4900, 'Reference'),
  makeEndpointRow('VARIANT_A',        1, 4500, 'Library_Variant'),
  makeEndpointRow('VARIANT_A',        2, 4600, 'Library_Variant'),
  makeEndpointRow('VARIANT_A',        3, 4400, 'Library_Variant'),
];
const w1 = validateParsedRows('PLATE_READER_ENDPOINT', cleanRows);
check('no warnings for clean file', w1.length === 0, `got ${w1.length}: ${w1.join(' | ')}`);

// ── Test 2: Missing WT_HSFAST_FUSION reference ────────────────────────────────
console.log('\nTest 2: missing WT_HSFAST_FUSION reference');
const noRefRows = [
  makeEndpointRow('VARIANT_A', 1, 4500),
  makeEndpointRow('VARIANT_A', 2, 4600),
  makeEndpointRow('VARIANT_A', 3, 4400),
  makeEndpointRow('VARIANT_A', 4, 4550),
];
const w2 = validateParsedRows('PLATE_READER_ENDPOINT', noRefRows);
check('warns about missing reference', w2.some(w => w.includes('WT_HSFAST_FUSION')), w2[0]);

// ── Test 3: Low replicate count ────────────────────────────────────────────────
console.log('\nTest 3: variants with only 1 or 2 replicates');
const lowRepRows = [
  makeEndpointRow('WT_HSFAST_FUSION', 1, 5000, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION', 2, 5100, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION', 3, 4900, 'Reference'),
  makeEndpointRow('VARIANT_A', 1, 4500), // only 1 replicate
  makeEndpointRow('VARIANT_B', 1, 3000), // only 1 replicate
  makeEndpointRow('VARIANT_B', 2, 3100), // 2 replicates
];
const w3 = validateParsedRows('PLATE_READER_ENDPOINT', lowRepRows);
check('warns about low replicates', w3.some(w => w.includes('replicate')), w3.join(' | '));
check('names the affected samples', w3.some(w => w.includes('VARIANT_A') || w.includes('VARIANT_B')), '');

// ── Test 4: Low fluorescence (plate failure) ────────────────────────────────
console.log('\nTest 4: very low fluorescence (< 200 RFU)');
const lowFluorRows = [
  makeEndpointRow('WT_HSFAST_FUSION', 1, 50, 'Reference'),
  makeEndpointRow('VARIANT_A', 1, 30),
  makeEndpointRow('VARIANT_A', 2, 45),
  makeEndpointRow('VARIANT_A', 3, 40),
  makeEndpointRow('VARIANT_A', 4, 35),
];
const w4 = validateParsedRows('PLATE_READER_ENDPOINT', lowFluorRows);
check('warns about low fluorescence', w4.some(w => w.includes('fluorescence') || w.includes('RFU')), w4.join(' | '));

// ── Test 5: Normal fluorescence — no low-fluor warning ───────────────────────
console.log('\nTest 5: normal fluorescence — no plate-failure warning');
const normalFluorRows = [
  makeEndpointRow('WT_HSFAST_FUSION', 1, 5000, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION', 2, 5100, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION', 3, 4900, 'Reference'),
  makeEndpointRow('VARIANT_A', 1, 3000),
  makeEndpointRow('VARIANT_A', 2, 2900),
  makeEndpointRow('VARIANT_A', 3, 3100),
  makeEndpointRow('VARIANT_A', 4, 3050),
];
const w5 = validateParsedRows('PLATE_READER_ENDPOINT', normalFluorRows);
check('no low-fluor warning', !w5.some(w => w.includes('fluorescence')), w5.join(' | '));

// ── Test 6: Known controls are NOT flagged for replicate count ────────────────
console.log('\nTest 6: control samples with 1 replicate do NOT trigger replicate warning');
const ctrlRows = [
  makeEndpointRow('WT_HSFAST_FUSION',  1, 5000, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION',  2, 5100, 'Reference'),
  makeEndpointRow('WT_HSFAST_FUSION',  3, 4900, 'Reference'),
  makeEndpointRow('FLUOROGEN_ONLY',    1, 100,  'Negative_Control'),
  makeEndpointRow('HSFAST_ONLY',       1, 4800, 'Positive_Control'),
  makeEndpointRow('WT_ENZYME_ONLY',    1, 80,   'Negative_Control'),
  makeEndpointRow('VARIANT_A',         1, 4500),
  makeEndpointRow('VARIANT_A',         2, 4600),
  makeEndpointRow('VARIANT_A',         3, 4400),
  makeEndpointRow('VARIANT_A',         4, 4550),
];
const w6 = validateParsedRows('PLATE_READER_ENDPOINT', ctrlRows);
check('no replicate warning for controls', !w6.some(w => w.includes('FLUOROGEN') || w.includes('HSFAST_ONLY') || w.includes('WT_ENZYME')), w6.join(' | '));

// ── Test 7: KINETIC_DENATURATION — multiple rows per replicate ─────────────────
console.log('\nTest 7: kinetic format — replicate count uses Replicate column, not row count');
const kineticRows = [
  // Replicate 1 — 3 time points
  makeKineticRow('WT_HSFAST_FUSION', 1, 70, 0,  5000),
  makeKineticRow('WT_HSFAST_FUSION', 1, 70, 10, 4500),
  makeKineticRow('WT_HSFAST_FUSION', 1, 70, 20, 4000),
  // Replicate 2
  makeKineticRow('WT_HSFAST_FUSION', 2, 70, 0,  4900),
  makeKineticRow('WT_HSFAST_FUSION', 2, 70, 10, 4400),
  makeKineticRow('WT_HSFAST_FUSION', 2, 70, 20, 3950),
  // Replicate 3
  makeKineticRow('WT_HSFAST_FUSION', 3, 70, 0,  5100),
  makeKineticRow('WT_HSFAST_FUSION', 3, 70, 10, 4600),
  makeKineticRow('WT_HSFAST_FUSION', 3, 70, 20, 4100),
  // VARIANT_A — only 1 replicate (3 time points but still 1 rep)
  makeKineticRow('VARIANT_A', 1, 70, 0,  3000),
  makeKineticRow('VARIANT_A', 1, 70, 10, 2700),
  makeKineticRow('VARIANT_A', 1, 70, 20, 2400),
];
const w7 = validateParsedRows('KINETIC_DENATURATION', kineticRows);
check('warns VARIANT_A has 1 replicate', w7.some(w => w.includes('VARIANT_A')), w7.join(' | '));
check('does not warn WT_HSFAST_FUSION for replicates', !w7.some(w => w.includes('replicate') && w.includes('WT_HSFAST_FUSION')), '');

// ── Test 8: Empty rows returns no warnings ────────────────────────────────────
console.log('\nTest 8: empty rows array returns no warnings');
check('empty rows', validateParsedRows('PLATE_READER_ENDPOINT', []).length === 0, '');

// ── Test 9: STANDARD_CURVE skips reference and replicate checks ───────────────
console.log('\nTest 9: STANDARD_CURVE type — reference and low-replicate checks skipped');
const scRows = [{ Standard_Curve: '1', Concentration_ug_mL: '10', Fluorescence_RFU: '5000' }];
const w9 = validateParsedRows('STANDARD_CURVE', scRows);
check('no reference warning for STANDARD_CURVE', !w9.some(w => w.includes('WT_HSFAST_FUSION')), '');

console.log(allPassed ? '\nAll tests passed.' : '\nSome tests FAILED.');
process.exit(allPassed ? 0 : 1);
