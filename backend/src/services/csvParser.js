const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const Measurement = require('../models/Measurement');

// ── Lightweight CSV parser (handles quoted fields with commas) ──────────────

function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'));  // skip blank + comment lines
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

// ── XLSX parser ─────────────────────────────────────────────────────────────
// Reads the first sheet of an .xlsx / .xls workbook and returns the same
// { headers, rows } shape that parseCSV() produces so all downstream
// parsers (detectType, parsePlateReaderEndpoint, …) work unchanged.

function parseXLSX(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  // defval: '' ensures empty cells become '' rather than undefined,
  // matching the behaviour of the CSV parser's parseLine()
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (rawRows.length === 0) return { headers: [], rows: [] };

  // Trim all header keys (labs sometimes add trailing spaces in Excel)
  const headers = Object.keys(rawRows[0]).map(h => String(h).trim());

  const rows = rawRows.map(raw => {
    const obj = {};
    for (const [key, val] of Object.entries(raw)) {
      // Convert every value to string so num() and string checks work
      // identically to the CSV path
      obj[String(key).trim()] = val === null || val === undefined ? '' : String(val).trim();
    }
    return obj;
  });

  return { headers, rows };
}

// ── File type detection ──────────────────────────────────────────────────────

function detectType(headers) {
  const h = new Set(headers.map(x => x.trim()));
  if (h.has('Temperature_C') && h.has('Time_min')) return 'KINETIC_DENATURATION';
  // Temperature scan (no time axis) → sigmoid Tm fitting
  if (h.has('Temperature_C') && h.has('Fluorescence_RFU') && !h.has('Time_min')) return 'THERMAL_DENATURATION_CURVE';
  if (h.has('Median_FAST_Fluorescence_AU') || h.has('Events_Recorded') || h.has('Percent_FAST_Positive')) return 'FACS';
  if (h.has('Standard_Curve') || h.has('Concentration_ug_mL')) return 'STANDARD_CURVE';
  if (h.has('Raw_Fluorescence_RFU') && h.has('Well') && h.has('Sample_ID')) return 'PLATE_READER_ENDPOINT';
  return null;
}

// ── Sample type helper ───────────────────────────────────────────────────────

function toSampleType(sampleClass, sampleId) {
  if (sampleClass === 'Library_Variant') return 'VARIANT';
  const id = (sampleId || '').toUpperCase();
  if (id === 'FLUOROGEN_ONLY' || id === 'WT_ENZYME_ONLY') return 'NEGATIVE_CONTROL';
  if (id === 'HSFAST_ONLY') return 'POSITIVE_CONTROL';
  if (id === 'WT_HSFAST_FUSION') return 'REFERENCE';
  return 'VARIANT';
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ── Parsers ──────────────────────────────────────────────────────────────────

async function parsePlateReaderEndpoint(rows, experimentId) {
  const docs = rows.map(r => ({
    experiment: experimentId,
    wellPosition: r.Well || null,
    sampleId: r.Sample_ID || null,
    variantDescription: r.Variant_Description || null,
    sampleType: toSampleType(r.Sample_Class, r.Sample_ID),
    replicateGroup: r.Sample_ID ? `${r.Sample_ID}_R${r.Replicate}` : null,
    condition: {},
    rawReadings: [{ timepoint: null, fluorescence: num(r.Raw_Fluorescence_RFU), unit: 'RFU' }],
    derivedMetrics: r.OD600_Harvest ? [{
      metricType: 'other',
      value: num(r.OD600_Harvest),
      unit: 'OD600',
      analyticsVersion: '1.0',
    }] : [],
    metadata: { od600: num(r.OD600_Harvest) || null, plate: r.Plate || null },
    qcFlags: [],
    excluded: false,
  }));

  await Measurement.insertMany(docs);
  return { type: 'PLATE_READER_ENDPOINT', count: docs.length };
}

async function parseFACS(rows, experimentId) {
  const docs = rows.map(r => ({
    experiment: experimentId,
    sampleId: r.Sample_ID || null,
    variantDescription: r.Variant_Description || null,
    sampleType: toSampleType(r.Sample_Class, r.Sample_ID),
    replicateGroup: r.Sample_ID ? `${r.Sample_ID}_R${r.Replicate}` : null,
    condition: {},
    rawReadings: [{
      timepoint: null,
      fluorescence: num(r.Median_FAST_Fluorescence_AU) ?? num(r.Mean_FAST_Fluorescence_AU),
      unit: 'AU',
    }],
    derivedMetrics: r.Percent_FAST_Positive != null && r.Percent_FAST_Positive !== '' ? [{
      metricType: 'other',
      value: num(r.Percent_FAST_Positive),
      unit: '% FAST+',
      analyticsVersion: '1.0',
    }] : [],
    metadata: {
      eventsRecorded:  num(r.Events_Recorded),
      singletCount:    num(r.Singlet_Cell_Count),
      medianFluor:     num(r.Median_FAST_Fluorescence_AU),
      meanFluor:       num(r.Mean_FAST_Fluorescence_AU),
      robustCV:        num(r.Robust_CV_percent),
      pctFastPositive: num(r.Percent_FAST_Positive),
      fscMedian:       num(r.FSC_Median),
      sscMedian:       num(r.SSC_Median),
    },
    qcFlags: [],
    excluded: false,
  }));

  await Measurement.insertMany(docs);
  return { type: 'FACS', count: docs.length };
}

async function parseKineticDenaturation(rows, experimentId) {
  const groups = {};
  for (const r of rows) {
    const key = `${r.Well}__${r.Sample_ID}__${r.Replicate}`;
    if (!groups[key]) {
      groups[key] = {
        experiment: experimentId,
        wellPosition: r.Well || null,
        sampleId: r.Sample_ID || null,
        variantDescription: r.Variant_Description || null,
        sampleType: toSampleType(r.Sample_Class, r.Sample_ID),
        replicateGroup: r.Sample_ID ? `${r.Sample_ID}_R${r.Replicate}` : null,
        condition: { temperature: num(r.Temperature_C) },
        rawReadings: [],
        derivedMetrics: [],
        metadata: {},
        qcFlags: [],
        excluded: false,
      };
    }
    groups[key].rawReadings.push({
      timepoint: num(r.Time_min),
      fluorescence: num(r.Fluorescence_RFU),
      unit: 'RFU',
    });
  }

  // Sort each well's time series
  for (const doc of Object.values(groups)) {
    doc.rawReadings.sort((a, b) => (a.timepoint ?? 0) - (b.timepoint ?? 0));
  }

  const docs = Object.values(groups);
  await Measurement.insertMany(docs);
  return { type: 'KINETIC_DENATURATION', count: docs.length };
}

async function parseStandardCurve(rows, experimentId) {
  // Store as generic measurements — standard curves are reference data
  const docs = rows.map(r => ({
    experiment: experimentId,
    sampleType: 'REFERENCE',
    replicateGroup: r.Standard_ID ? `${r.Standard_ID}_R${r.Replicate}` : null,
    condition: {},
    rawReadings: [
      ...(r.Fluorescence_RFU != null && r.Fluorescence_RFU !== '' ? [{
        timepoint: null, fluorescence: num(r.Fluorescence_RFU), unit: 'RFU',
      }] : []),
      ...(r.A595_blank_subtracted != null && r.A595_blank_subtracted !== '' ? [{
        timepoint: null, fluorescence: num(r.A595_blank_subtracted), unit: 'A595',
      }] : []),
    ],
    derivedMetrics: r.Concentration_ug_mL != null && r.Concentration_ug_mL !== '' ? [{
      metricType: 'other',
      value: num(r.Concentration_ug_mL),
      unit: 'ug/mL',
      analyticsVersion: '1.0',
    }] : [],
    qcFlags: [],
    excluded: false,
  }));

  await Measurement.insertMany(docs);
  return { type: 'STANDARD_CURVE', count: docs.length };
}

async function parseThermalDenaturationCurve(rows, experimentId) {
  const groups = {};
  for (const r of rows) {
    const key = `${r.Well || ''}__${r.Sample_ID || ''}__${r.Replicate || ''}`;
    if (!groups[key]) {
      groups[key] = {
        experiment: experimentId,
        wellPosition: r.Well || null,
        sampleId: r.Sample_ID || null,
        variantDescription: r.Variant_Description || null,
        sampleType: toSampleType(r.Sample_Class, r.Sample_ID),
        replicateGroup: r.Sample_ID ? `${r.Sample_ID}_R${r.Replicate}` : null,
        condition: {},
        rawReadings: [],
        derivedMetrics: [],
        metadata: { dataType: 'thermal_ramp' },
        qcFlags: [],
        excluded: false,
      };
    }
    groups[key].rawReadings.push({
      timepoint: num(r.Temperature_C),   // temperature stored in timepoint field
      fluorescence: num(r.Fluorescence_RFU),
      unit: 'RFU',
    });
  }

  for (const doc of Object.values(groups)) {
    doc.rawReadings.sort((a, b) => (a.timepoint ?? 0) - (b.timepoint ?? 0));
  }

  const docs = Object.values(groups);
  await Measurement.insertMany(docs);
  return { type: 'THERMAL_DENATURATION_CURVE', count: docs.length };
}

// ── Main entry ───────────────────────────────────────────────────────────────

async function parseUploadedFile(filePath, experimentId) {
  const ext = path.extname(filePath).toLowerCase();

  let headers, rows;
  if (ext === '.xlsx' || ext === '.xls') {
    ({ headers, rows } = parseXLSX(filePath));
  } else {
    const content = fs.readFileSync(filePath, 'utf8');
    ({ headers, rows } = parseCSV(content));
  }

  if (rows.length === 0) throw new Error('File appears to be empty or has only a header row.');

  const fileType = detectType(headers);
  if (!fileType) {
    const found = headers.slice(0, 5).join(', ');
    throw new Error(
      `CSV format not recognised (found headers: ${found}). ` +
      `Expected: Plate Reader → Well + Sample_ID + Raw_Fluorescence_RFU; ` +
      `FACS → Median_FAST_Fluorescence_AU + Sample_ID; ` +
      `Kinetic decay → Temperature_C + Time_min + Fluorescence_RFU; ` +
      `Thermal ramp (Tm) → Temperature_C + Fluorescence_RFU (no Time_min); ` +
      `Standard Curve → Standard_Curve + Concentration_ug_mL. ` +
      `Note: prediction export CSVs cannot be uploaded as experiment data.`
    );
  }

  switch (fileType) {
    case 'PLATE_READER_ENDPOINT':     return parsePlateReaderEndpoint(rows, experimentId);
    case 'FACS':                      return parseFACS(rows, experimentId);
    case 'KINETIC_DENATURATION':      return parseKineticDenaturation(rows, experimentId);
    case 'THERMAL_DENATURATION_CURVE': return parseThermalDenaturationCurve(rows, experimentId);
    case 'STANDARD_CURVE':            return parseStandardCurve(rows, experimentId);
  }
}

// ── Upload validation ─────────────────────────────────────────────────────────
// Pure function — no DB writes. Returns an array of human-readable warning strings.
// Called synchronously before the upload response so scientists see issues immediately.

const KNOWN_CONTROLS = new Set([
  'WT_HSFAST_FUSION', 'FLUOROGEN_ONLY', 'WT_ENZYME_ONLY', 'HSFAST_ONLY',
]);

// Types where a WT_HSFAST_FUSION reference well is meaningful
const REF_REQUIRED_TYPES = new Set([
  'PLATE_READER_ENDPOINT', 'KINETIC_DENATURATION', 'THERMAL_DENATURATION_CURVE',
]);

// Column name holding fluorescence for each file type
const FLUOR_COL = {
  PLATE_READER_ENDPOINT:     'Raw_Fluorescence_RFU',
  KINETIC_DENATURATION:      'Fluorescence_RFU',
  THERMAL_DENATURATION_CURVE: 'Fluorescence_RFU',
  FACS:                      'Median_FAST_Fluorescence_AU',
};

const LOW_FLUOR_THRESHOLD = 200; // RFU / AU — below this almost certainly indicates plate failure

function validateParsedRows(fileType, rows) {
  const warnings = [];
  if (!fileType || rows.length === 0) return warnings;

  // ── Check 1: WT_HSFAST_FUSION reference well ─────────────────────────────
  if (REF_REQUIRED_TYPES.has(fileType)) {
    const hasRef = rows.some(r => (r.Sample_ID || '').trim().toUpperCase() === 'WT_HSFAST_FUSION');
    if (!hasRef) {
      warnings.push(
        'No WT_HSFAST_FUSION reference well found — fold-change normalisation will be skipped for this file.',
      );
    }
  }

  // ── Check 2: Low replicate count per variant sample ──────────────────────
  if (FLUOR_COL[fileType]) { // skip STANDARD_CURVE
    const repSets = {}; // sampleId → Set of replicate labels
    for (const r of rows) {
      const id = (r.Sample_ID || '').trim();
      if (!id || KNOWN_CONTROLS.has(id.toUpperCase())) continue;
      if (!repSets[id]) repSets[id] = new Set();
      // Use Replicate column if present; fall back to row-as-single-replicate
      repSets[id].add((r.Replicate || '').trim() || '__solo__');
    }

    const lowRep = Object.entries(repSets)
      .filter(([, reps]) => reps.size < 3)
      .map(([id, reps]) => `${id} (${reps.size})`);

    if (lowRep.length > 0) {
      const preview = lowRep.slice(0, 3).join(', ');
      const tail    = lowRep.length > 3 ? ` and ${lowRep.length - 3} more` : '';
      warnings.push(
        `${lowRep.length} variant sample(s) have fewer than 3 replicates: ${preview}${tail}. ` +
        'The Grubbs outlier test requires ≥4 replicates to run.',
      );
    }
  }

  // ── Check 3: Anomalously low total fluorescence (plate failure) ───────────
  const fluorCol = FLUOR_COL[fileType];
  if (fluorCol) {
    const fluors = rows.map(r => num(r[fluorCol])).filter(v => v != null && v > 0);
    if (fluors.length > 0) {
      const meanF = fluors.reduce((a, b) => a + b, 0) / fluors.length;
      if (meanF < LOW_FLUOR_THRESHOLD) {
        warnings.push(
          `Mean fluorescence is ${Math.round(meanF)} RFU — unusually low. ` +
          'Check for plate reader failure or missing fluorophore.',
        );
      }
    }
  }

  return warnings;
}

function validateUploadedFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    let headers, rows;
    if (ext === '.xlsx' || ext === '.xls') {
      ({ headers, rows } = parseXLSX(filePath));
    } else {
      const content = fs.readFileSync(filePath, 'utf8');
      ({ headers, rows } = parseCSV(content));
    }
    const fileType = detectType(headers);
    const warnings = validateParsedRows(fileType, rows);
    return { warnings, fileType, rowCount: rows.length };
  } catch {
    return { warnings: [], fileType: null, rowCount: 0 };
  }
}

module.exports = { parseUploadedFile, validateParsedRows, validateUploadedFile };
