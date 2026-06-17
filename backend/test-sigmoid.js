'use strict';
// Smoke test for fitSigmoid — runs without a MongoDB connection.
// Usage (from project root):  node backend/test-sigmoid.js

const { fitSigmoid } = require('./src/services/analyticsService');

// Ground truth: Boltzmann sigmoid F(T) = Fmin + (Fmax-Fmin)/(1+exp((T-Tm)/k))
const TRUE_TM   = 65.0;
const TRUE_K    =  4.0;
const TRUE_FMIN =  200;
const TRUE_FMAX = 8000;

function syntheticF(T, noisePct = 0) {
  const signal = TRUE_FMIN + (TRUE_FMAX - TRUE_FMIN) / (1 + Math.exp((T - TRUE_TM) / TRUE_K));
  const noise  = noisePct * (TRUE_FMAX - TRUE_FMIN) * (Math.random() - 0.5) * 2;
  return signal + noise;
}

// Temperature scan 40-90°C in 2°C steps (26 points)
const temps = Array.from({ length: 26 }, (_, i) => 40 + i * 2);

function makeReadings(noisePct) {
  return temps.map(T => ({ timepoint: T, fluorescence: syntheticF(T, noisePct) }));
}

let allPassed = true;

function check(label, condition, detail) {
  if (!condition) {
    console.error(`  FAIL  ${label}: ${detail}`);
    allPassed = false;
  } else {
    console.log(`  PASS  ${label}: ${detail}`);
  }
}

// ── Test 1: Clean data ────────────────────────────────────────────────────────
console.log('\nTest 1: clean synthetic data (no noise)');
const cleanResult = fitSigmoid(makeReadings(0));
if (!cleanResult) {
  console.error('  FAIL  fitSigmoid returned null on clean data');
  allPassed = false;
} else {
  const tmErr = Math.abs(cleanResult.Tm - TRUE_TM);
  check('Tm recovery', tmErr < 0.1, `true=${TRUE_TM}, fit=${cleanResult.Tm}, err=${tmErr.toFixed(4)} C`);
  check('R2 near 1',   cleanResult.r2 > 0.9999, `R2=${cleanResult.r2}`);
  check('k positive',  cleanResult.k > 0, `k=${cleanResult.k}`);
  check('Fmax>Fmin',   cleanResult.Fmax > cleanResult.Fmin,
        `Fmax=${cleanResult.Fmax}, Fmin=${cleanResult.Fmin}`);
}

// ── Test 2: Noisy data ────────────────────────────────────────────────────────
console.log('\nTest 2: noisy data (+/-2% amplitude noise)');
// Run 3 times with different random seeds to average noise
const noisyErrors = [];
for (let i = 0; i < 3; i++) {
  const res = fitSigmoid(makeReadings(0.02));
  if (res) noisyErrors.push(Math.abs(res.Tm - TRUE_TM));
}
const avgErr = noisyErrors.reduce((a, b) => a + b, 0) / noisyErrors.length;
check('Tm within 2C on noisy data', avgErr < 2.0,
      `avg |err|=${avgErr.toFixed(3)} C over ${noisyErrors.length} trials`);

// ── Test 3: Too few points ────────────────────────────────────────────────────
console.log('\nTest 3: fewer than 5 points returns null');
const shortResult = fitSigmoid([
  { timepoint: 50, fluorescence: 7000 },
  { timepoint: 65, fluorescence: 4100 },
  { timepoint: 80, fluorescence: 300 },
]);
check('null on <5 points', shortResult === null, `result=${shortResult}`);

// ── Test 4: Different Tm ──────────────────────────────────────────────────────
console.log('\nTest 4: variant with Tm=58, k=3');
const variant = temps.map(T => ({
  timepoint: T,
  fluorescence: 500 + (6000 - 500) / (1 + Math.exp((T - 58) / 3)),
}));
const varResult = fitSigmoid(variant);
if (!varResult) {
  console.error('  FAIL  fitSigmoid returned null for variant');
  allPassed = false;
} else {
  const tmErr = Math.abs(varResult.Tm - 58);
  check('Tm=58 recovery', tmErr < 0.1, `fit=${varResult.Tm}, err=${tmErr.toFixed(4)} C`);
  check('R2>0.9999', varResult.r2 > 0.9999, `R2=${varResult.r2}`);
}

console.log(allPassed ? '\nAll tests passed.' : '\nSome tests FAILED.');
process.exit(allPassed ? 0 : 1);
