'use strict';
const express  = require('express');
const PDFDoc   = require('pdfkit');
const Experiment  = require('../models/Experiment');
const Measurement = require('../models/Measurement');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ── Simple table renderer ─────────────────────────────────────────────────────

function drawTable(doc, { x, y, colWidths, headers, rows, rowHeight = 18, headerBg = '#1e40af', textColor = '#374151' }) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  // Header row
  doc.fillColor(headerBg);
  doc.rect(x, y, totalW, rowHeight).fill();
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  let cx = x;
  headers.forEach((h, i) => {
    doc.text(h, cx + 4, y + 5, { width: colWidths[i] - 8, align: 'left', lineBreak: false });
    cx += colWidths[i];
  });

  // Data rows
  doc.font('Helvetica').fillColor(textColor);
  rows.forEach((row, ri) => {
    const ry = y + rowHeight * (ri + 1);
    if (ri % 2 === 1) {
      doc.fillColor('#f8fafc').rect(x, ry, totalW, rowHeight).fill();
    }
    doc.fillColor(textColor);
    let cx2 = x;
    row.forEach((cell, ci) => {
      const cellStr = cell != null ? String(cell) : '—';
      doc.fontSize(8).text(cellStr, cx2 + 4, ry + 5, { width: colWidths[ci] - 8, align: 'left', lineBreak: false });
      cx2 += colWidths[ci];
    });
    // row divider
    doc.moveTo(x, ry + rowHeight).lineTo(x + totalW, ry + rowHeight).lineWidth(0.3).strokeColor('#e2e8f0').stroke();
  });

  // Outer border
  doc.rect(x, y, totalW, rowHeight * (rows.length + 1)).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

  return y + rowHeight * (rows.length + 1);
}

// ── GET /api/exports/experiment/:id/pdf ───────────────────────────────────────

router.get('/experiment/:id/pdf', async (req, res, next) => {
  try {
    const experiment = await Experiment.findById(req.params.id)
      .populate('project', 'name')
      .populate('createdBy', 'name');
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });

    const measurements = await Measurement.find({
      experiment: experiment._id,
    }).populate('variant', 'name mutations').lean();

    // ── Derived analytics ────────────────────────────────────────────────────
    const passing   = measurements.filter(m => !m.excluded && (!m.qcFlags || m.qcFlags.length === 0));
    const excluded  = measurements.filter(m => m.excluded);
    const grubbs    = measurements.filter(m => m.qcFlags?.includes('grubbs_outlier'));
    const poorFit   = measurements.filter(m => m.qcFlags?.includes('poor_fit'));

    // Top 10 by half-life
    const withHL = measurements
      .map(m => {
        const hl = m.derivedMetrics?.find(d => d.metricType === 'half_life');
        const fc = m.derivedMetrics?.find(d => d.metricType === 'fold_change');
        const tm = m.derivedMetrics?.find(d => d.metricType === 'apparent_tm');
        return hl ? {
          name:       m.variant?.name || m.replicateGroup?.replace(/_R\d+$/, '') || m.sampleId || m.sampleType,
          halfLife:   hl.value,
          r2:         hl.goodnessOfFit,
          foldChange: fc?.value ?? null,
          tm:         tm?.value ?? null,
          qc:         m.excluded ? 'Excluded' : (m.qcFlags?.[0] || 'Pass'),
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.halfLife - a.halfLife)
      .slice(0, 10);

    const folds = measurements.flatMap(m =>
      (m.derivedMetrics || []).filter(d => d.metricType === 'fold_change').map(d => d.value)
    ).filter(v => v != null);
    const tms = measurements.flatMap(m =>
      (m.derivedMetrics || []).filter(d => d.metricType === 'apparent_tm').map(d => d.value)
    ).filter(v => v != null);

    const bestHL = withHL[0] ?? null;
    const bestFC = folds.length ? Math.max(...folds).toFixed(4) : null;
    const bestTm = tms.length ? Math.max(...tms).toFixed(2) : null;

    // ── Build PDF ────────────────────────────────────────────────────────────
    const doc = new PDFDoc({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: {
        Title:    `Experiment Report — ${experiment.name}`,
        Author:   'hsFAST Stability Platform',
        Creator:  'hsFAST Stability Platform',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="experiment_${experiment._id}_report.pdf"`);
    doc.pipe(res);

    const PAGE_W  = doc.page.width  - doc.page.margins.left - doc.page.margins.right;
    const L       = doc.page.margins.left;
    let   Y       = doc.page.margins.top;

    // ── Header bar ───────────────────────────────────────────────────────────
    doc.rect(L, Y, PAGE_W, 48).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
      .text('hsFAST Stability Platform', L + 12, Y + 8, { lineBreak: false });
    doc.fontSize(9).font('Helvetica').fillColor('#93c5fd')
      .text('Experiment Report', L + 12, Y + 28, { lineBreak: false });
    doc.fillColor('#ffffff').fontSize(9)
      .text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        L + PAGE_W - 130, Y + 28, { width: 120, align: 'right', lineBreak: false });
    Y += 60;

    // ── Experiment metadata ───────────────────────────────────────────────────
    doc.fillColor('#1e3a5f').fontSize(12).font('Helvetica-Bold')
      .text('Experiment Details', L, Y);
    Y += 16;

    const metaFields = [
      ['Name',       experiment.name],
      ['Project',    experiment.project?.name || '—'],
      ['Date',       experiment.date ? new Date(experiment.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'],
      ['Assay type', experiment.assayType],
      ['Operator',   experiment.operator || '—'],
      ['Instrument', experiment.instrument || '—'],
    ];

    const colW = PAGE_W / 2;
    metaFields.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const fx  = L + col * colW;
      const fy  = Y + row * 18;
      doc.fillColor('#6b7280').fontSize(8).font('Helvetica')
        .text(label.toUpperCase(), fx, fy, { lineBreak: false });
      doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold')
        .text(value, fx + 80, fy, { width: colW - 84, lineBreak: false });
    });
    Y += Math.ceil(metaFields.length / 2) * 18 + 8;

    if (experiment.notes) {
      doc.fillColor('#6b7280').fontSize(8).font('Helvetica')
        .text('NOTES', L, Y, { lineBreak: false });
      doc.fillColor('#374151').fontSize(8).font('Helvetica')
        .text(experiment.notes, L + 80, Y, { width: PAGE_W - 80 });
      Y = doc.y + 8;
    }

    // Divider
    doc.moveTo(L, Y).lineTo(L + PAGE_W, Y).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
    Y += 12;

    // ── QC Summary ────────────────────────────────────────────────────────────
    doc.fillColor('#1e3a5f').fontSize(12).font('Helvetica-Bold')
      .text('Quality Control Summary', L, Y);
    Y += 16;

    const qcBoxes = [
      { label: 'Total',    value: measurements.length, color: '#3b82f6' },
      { label: 'Passing',  value: passing.length,      color: '#10b981' },
      { label: 'Grubbs',   value: grubbs.length,       color: '#f59e0b' },
      { label: 'Poor fit', value: poorFit.length,      color: '#f97316' },
      { label: 'Excluded', value: excluded.length,     color: '#ef4444' },
    ];

    const boxW = PAGE_W / qcBoxes.length;
    qcBoxes.forEach(({ label, value, color }, i) => {
      const bx = L + i * boxW;
      doc.fillColor(color).rect(bx + 2, Y, boxW - 4, 40).fill();
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
        .text(String(value), bx + 2, Y + 5, { width: boxW - 4, align: 'center', lineBreak: false });
      doc.fontSize(7).font('Helvetica')
        .text(label, bx + 2, Y + 26, { width: boxW - 4, align: 'center', lineBreak: false });
    });
    Y += 52;

    // ── Best Results ─────────────────────────────────────────────────────────
    if (bestHL || bestFC || bestTm) {
      doc.moveTo(L, Y).lineTo(L + PAGE_W, Y).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
      Y += 12;

      doc.fillColor('#1e3a5f').fontSize(12).font('Helvetica-Bold')
        .text('Best Results', L, Y);
      Y += 16;

      const kpiData = [
        bestHL ? { label: 'Best Half-life',     value: `${bestHL.halfLife} min`,  sub: bestHL.name,         color: '#1d4ed8' } : null,
        bestFC ? { label: 'Best Fold Change',   value: `${bestFC}×`,              sub: 'vs WT reference',    color: '#059669' } : null,
        bestTm ? { label: 'Best Apparent Tm',   value: `${bestTm} °C`,            sub: 'sigmoid R² fitted',  color: '#dc2626' } : null,
      ].filter(Boolean);

      const kpiW = PAGE_W / Math.max(kpiData.length, 1);
      kpiData.forEach(({ label, value, sub, color }, i) => {
        const kx = L + i * kpiW;
        const [r, g, b] = hexToRgb(color);
        doc.fillColor([r, g, b]).rect(kx + 2, Y, kpiW - 4, 48)
          .fillOpacity(0.1).fill();
        doc.fillOpacity(1);
        doc.fillColor(color).fontSize(8).font('Helvetica')
          .text(label.toUpperCase(), kx + 8, Y + 6, { width: kpiW - 16, lineBreak: false });
        doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
          .text(value, kx + 8, Y + 18, { width: kpiW - 16, lineBreak: false });
        doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
          .text(sub, kx + 8, Y + 37, { width: kpiW - 16, lineBreak: false });
      });
      Y += 60;
    }

    // ── Top variants table ────────────────────────────────────────────────────
    if (withHL.length > 0) {
      doc.moveTo(L, Y).lineTo(L + PAGE_W, Y).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
      Y += 12;

      doc.fillColor('#1e3a5f').fontSize(12).font('Helvetica-Bold')
        .text(`Top ${withHL.length} Variants by Half-life`, L, Y);
      Y += 14;

      const cols = [20, PAGE_W - 150, 60, 40, 60, 60];  // Rank, Name, t½, R², Fold, QC
      Y = drawTable(doc, {
        x: L, y: Y,
        colWidths: cols,
        headers:   ['#', 'Sample', 't½ (min)', 'R²', 'Fold WT', 'QC'],
        rows: withHL.map((r, i) => [
          i + 1,
          r.name,
          r.halfLife != null ? r.halfLife.toFixed(2) : '—',
          r.r2 != null ? r.r2.toFixed(3) : '—',
          r.foldChange != null ? `${r.foldChange.toFixed(3)}×` : '—',
          r.qc,
        ]),
      });
      Y += 8;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - doc.page.margins.bottom - 16;
    doc.moveTo(L, footerY - 4).lineTo(L + PAGE_W, footerY - 4).lineWidth(0.3).strokeColor('#e2e8f0').stroke();
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
      .text(
        `Generated by hsFAST Stability Platform · ${new Date().toISOString()} · Experiment ID: ${experiment._id}`,
        L, footerY, { width: PAGE_W, align: 'center', lineBreak: false },
      );

    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
