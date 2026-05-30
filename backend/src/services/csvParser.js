const fs = require('fs');
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

// ── File type detection ──────────────────────────────────────────────────────

function detectType(headers) {
  const h = new Set(headers.map(x => x.trim()));
  if (h.has('Temperature_C') && h.has('Time_min')) return 'KINETIC_DENATURATION';
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

// ── Main entry ───────────────────────────────────────────────────────────────

async function parseUploadedFile(filePath, experimentId) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { headers, rows } = parseCSV(content);

  if (rows.length === 0) throw new Error('File appears to be empty or has only a header row.');

  const fileType = detectType(headers);
  if (!fileType) {
    const found = headers.slice(0, 5).join(', ');
    throw new Error(
      `CSV format not recognised (found headers: ${found}). ` +
      `Expected: Plate Reader → Well + Sample_ID + Raw_Fluorescence_RFU; ` +
      `FACS → Median_FAST_Fluorescence_AU + Sample_ID; ` +
      `Kinetic → Temperature_C + Time_min + Fluorescence_RFU; ` +
      `Standard Curve → Standard_Curve + Concentration_ug_mL. ` +
      `Note: prediction export CSVs cannot be uploaded as experiment data.`
    );
  }

  switch (fileType) {
    case 'PLATE_READER_ENDPOINT': return parsePlateReaderEndpoint(rows, experimentId);
    case 'FACS':                  return parseFACS(rows, experimentId);
    case 'KINETIC_DENATURATION':  return parseKineticDenaturation(rows, experimentId);
    case 'STANDARD_CURVE':        return parseStandardCurve(rows, experimentId);
  }
}

module.exports = { parseUploadedFile };
