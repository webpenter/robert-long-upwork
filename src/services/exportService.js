export function exportToCSV(prediction) {
  const meta = [
    `# EnzymeML Stability Prediction Report`,
    `# Protein: ${prediction.header}`,
    `# Date: ${new Date(prediction.timestamp).toLocaleString()}`,
    `# Temperature: ${prediction.conditions.temperature}°C  |  pH: ${prediction.conditions.ph}  |  Solvent: ${prediction.conditions.solvent}  |  Ionic Strength: ${prediction.conditions.ionicStrength} M`,
    `# Sequence Length: ${prediction.features.length} aa  |  Est. MW: ${prediction.features.estimatedMW} kDa`,
    `# Model: ${prediction.model}`,
    ``,
  ].join('\n');

  const headers = ['Rank', 'Mutation', 'Position', 'Original AA', 'Substitution', 'Stability Score', 'Confidence', 'Activity Risk', 'ΔΔG (kcal/mol)'];
  const rows = prediction.mutations.map(m => [
    m.rank, m.mutation, m.position, m.original, m.substitution,
    m.stabilityScore, m.confidence, m.activityRisk, m.ddG
  ]);

  const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([meta + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `enzml_prediction_${prediction.id}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
