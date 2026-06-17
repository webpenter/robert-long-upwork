'use strict';
// Smoke test for grubbsTest — runs without a MongoDB connection.
// Usage (from project root): node backend/test-grubbs.js

const { grubbsTest } = require('./src/services/analyticsService');

let allPassed = true;

function check(label, condition, detail) {
  if (!condition) {
    console.error(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
    allPassed = false;
  } else {
    console.log(`  PASS  ${label}${detail ? ': ' + detail : ''}`);
  }
}

// ── Test 1: Clear outlier at end of array (n=5) ───────────────────────────────
// mean=87.4, s=29.3, G[35]=1.79 > G_crit(5)=1.715
console.log('\nTest 1: outlier at last position (n=5)');
check('returns index 4', grubbsTest([100, 101, 99, 102, 35]) === 4, 'values=[100,101,99,102,35]');

// ── Test 2: Clear outlier at first position (n=5) ────────────────────────────
// G[999] >> G_crit(5)
console.log('\nTest 2: outlier at first position (n=5)');
check('returns index 0', grubbsTest([999, 10, 11, 12, 10.5]) === 0, 'values=[999,10,11,12,10.5]');

// ── Test 3: No outlier in tight cluster (n=5) ────────────────────────────────
// all within ~2% → G_max << 1.715
console.log('\nTest 3: no outlier in tight cluster (n=5)');
check('returns null', grubbsTest([100, 102, 101, 103, 99]) === null, 'values=[100,102,101,103,99]');

// ── Test 4: Fewer than 4 values → always null ────────────────────────────────
// n=3 has algebraic upper bound G≤2/sqrt(3)=G_crit, so test cannot fire
console.log('\nTest 4: n<4 always returns null (algebraic Grubbs limitation for n=3)');
check('n=3 returns null', grubbsTest([100, 101, 5])     === null, '');
check('n=2 returns null', grubbsTest([100, 200])        === null, '');
check('n=1 returns null', grubbsTest([100])             === null, '');
check('n=0 returns null', grubbsTest([])                === null, '');

// ── Test 5: All identical values → null (s=0) ────────────────────────────────
console.log('\nTest 5: all identical values (s=0)');
check('returns null', grubbsTest([50, 50, 50, 50]) === null, '');

// ── Test 6: Clear outlier in n=4 ─────────────────────────────────────────────
// mean=80, s=40.0, G[20]=1.50 > G_crit(4)=1.481
console.log('\nTest 6: n=4 outlier at last position');
check('returns index 3', grubbsTest([100, 101, 99, 20]) === 3, 'values=[100,101,99,20]');

// ── Test 7: Borderline — slightly below threshold ────────────────────────────
// [100,101,99,102,85]: max deviation is 85, mean≈97.4, s≈6.8, G≈1.82 > 1.715 (outlier)
// vs [100,101,99,102,90]: mean≈98.4, s≈4.8, G[90]=1.75 > 1.715 (outlier)
// vs tight cluster where max G < 1.715
console.log('\nTest 7: borderline — max G just below threshold returns null');
// Construct data where G_max < G_crit
// [50,51,49,50,52]: mean=50.4, s=1.14, G_max=|52-50.4|/1.14=1.40 < 1.715
check('tight n=5 returns null', grubbsTest([50, 51, 49, 50, 52]) === null, 'values=[50,51,49,50,52]');

// ── Test 8: Negative values (fluorescence edge case) ─────────────────────────
console.log('\nTest 8: negative values handled correctly');
// [-5, -6, -4, -5, -50]: outlier = -50 at index 4
const r8 = grubbsTest([-5, -6, -4, -5, -50]);
check('negative outlier at index 4', r8 === 4, `got ${r8}`);

// ── Test 9: Large n (n=10) ────────────────────────────────────────────────────
console.log('\nTest 9: n=10 outlier detection');
const vals9 = [100, 102, 99, 101, 103, 100, 98, 101, 102, 5];
const r9 = grubbsTest(vals9);
check('outlier at index 9', r9 === 9, `got ${r9}`);

console.log(allPassed ? '\nAll tests passed.' : '\nSome tests FAILED.');
process.exit(allPassed ? 0 : 1);
