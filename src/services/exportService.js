export function exportToCSV(prediction) {
  const conditions = prediction.conditions || {};
  const condStr = [
    conditions.temperature != null && `Temperature=${conditions.temperature}degC`,
    conditions.ph != null && `pH=${conditions.ph}`,
    conditions.solvent && `Solvent=${conditions.solvent}`,
    conditions.ionicStrength != null && `IonicStrength=${conditions.ionicStrength}M`,
  ].filter(Boolean).join(' | ') || 'Not specified';

  const meta = [
    '# hsFAST Stability Prediction Report',
    `# Protein: ${prediction.fastaSequence?.split('\n')[0]?.replace('>', '') || 'Unknown'}`,
    `# Date: ${new Date(prediction.createdAt || Date.now()).toLocaleString()}`,
    `# Conditions: ${condStr}`,
    `# Tier: ${prediction.tier || 'BRONZE'}`,
    `# Model: ${prediction.modelVersion || 'mock-v1.0'}`,
    `# Note: ddG (kcal/mol) = predicted free energy change on unfolding. More negative = more stable.`,
    ``,
  ].join('\n');

  const candidates = prediction.candidates || [];
  const headers = [
    'Rank', 'Mutation', 'Position', 'From_AA', 'To_AA',
    'Predicted_dTm_C', 'ddG_kcal_per_mol', 'CI_Low', 'CI_High',
    'Activity_Risk', 'Supporting_Variants',
  ];

  const rows = candidates.map(m => [
    m.rank,
    m.mutation,
    m.position,
    m.originalAa || m.mutation?.[0] || '',
    m.substitutedAa || m.mutation?.slice(-1) || '',
    m.predictedStabilityChange != null ? m.predictedStabilityChange.toFixed(2) : '',
    m.ddG != null ? m.ddG.toFixed(2) : '',
    m.confidenceLow != null ? m.confidenceLow.toFixed(2) : '',
    m.confidenceHigh != null ? m.confidenceHigh.toFixed(2) : '',
    m.activityRisk != null
      ? (typeof m.activityRisk === 'number'
          ? (m.activityRisk <= 0.3 ? 'Low' : m.activityRisk <= 0.6 ? 'Medium' : 'High')
          : m.activityRisk)
      : '',
    m.supportingVariants != null ? m.supportingVariants : '',
  ]);

  const csvLines = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  // UTF-8 BOM ensures degree/special chars render correctly in Excel
  const BOM = '﻿';
  const blob = new Blob([BOM + meta + csvLines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hsFAST_prediction_${String(prediction._id || prediction.id).slice(-8)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
