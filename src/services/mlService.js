const AMINO_ACIDS = ['A','C','D','E','F','G','H','I','K','L','M','N','P','Q','R','S','T','V','W','Y'];

const HYDROPHOBICITY = {
  A:1.8, R:-4.5, N:-3.5, D:-3.5, C:2.5, Q:-3.5, E:-3.5, G:-0.4,
  H:-3.2, I:4.5, L:3.8, K:-3.9, M:1.9, F:2.8, P:-1.6, S:-0.8,
  T:-0.7, W:-0.9, Y:-1.3, V:4.2
};

const SUBSTITUTION_PREFERENCES = {
  A:['V','G','S','T'], C:['S','A','T'], D:['E','N','S'], E:['D','Q','K'],
  F:['Y','L','W'], G:['A','S','V'], H:['Q','N','R'], I:['L','V','M'],
  K:['R','Q','E'], L:['I','V','M'], M:['L','I','V'], N:['Q','D','S'],
  P:['A','S','G'], Q:['N','K','E'], R:['K','Q','H'], S:['T','A','N'],
  T:['S','A','V'], V:['I','L','A'], W:['F','Y','L'], Y:['F','W','H'],
};

export function parseFASTA(input) {
  const lines = input.trim().split('\n');
  let header = '';
  let sequence = '';
  for (const line of lines) {
    if (line.startsWith('>')) { header = line.slice(1).trim(); }
    else { sequence += line.trim().toUpperCase().replace(/\s/g, ''); }
  }
  return { header: header || 'Unknown Protein', sequence };
}

// Parse one OR many sequences. Multiple records must be in FASTA format,
// each starting with a '>' header line. Header-less input is treated as a
// single sequence (back-compat with the original single-sequence flow).
export function parseMultiFASTA(input) {
  const text = (input || '').trim();
  if (!text) return [];

  if (!text.includes('>')) {
    const { header, sequence } = parseFASTA(text);
    return sequence ? [{ header, sequence }] : [];
  }

  const records = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('>')) {
      if (cur) records.push(cur);
      cur = { header: line.slice(1).trim() || `Sequence ${records.length + 1}`, sequence: '' };
    } else {
      const clean = line.trim().toUpperCase().replace(/\s/g, '');
      if (!cur) cur = { header: 'Sequence 1', sequence: '' };
      cur.sequence += clean;
    }
  }
  if (cur) records.push(cur);
  return records.filter(r => r.sequence.length > 0);
}

export function validateSequence(sequence) {
  if (!sequence || sequence.length === 0) return { valid: false, error: 'Sequence is empty' };
  if (sequence.length < 10) return { valid: false, error: 'Sequence too short (minimum 10 amino acids)' };
  if (sequence.length > 5000) return { valid: false, error: 'Sequence too long (maximum 5000 amino acids)' };
  const validSet = new Set(AMINO_ACIDS);
  const invalidChars = [...new Set(sequence.split('').filter(c => !validSet.has(c)))];
  if (invalidChars.length > 0) return { valid: false, error: `Invalid characters detected: ${invalidChars.join(', ')}` };
  return { valid: true, error: null };
}

export function extractFeatures(sequence) {
  const length = sequence.length;
  const composition = {};
  for (const aa of AMINO_ACIDS) {
    composition[aa] = parseFloat((sequence.split('').filter(c => c === aa).length / length * 100).toFixed(1));
  }
  const avgHydrophobicity = sequence.split('').reduce((s, aa) => s + (HYDROPHOBICITY[aa] || 0), 0) / length;
  const chargedResidues = (sequence.match(/[RKHDE]/g) || []).length;
  const aromaticResidues = (sequence.match(/[FWY]/g) || []).length;
  const prolineCount = (sequence.match(/P/g) || []).length;
  return {
    length,
    composition,
    avgHydrophobicity: parseFloat(avgHydrophobicity.toFixed(3)),
    chargedResidues,
    chargedFraction: parseFloat((chargedResidues / length * 100).toFixed(1)),
    aromaticResidues,
    prolineContent: parseFloat((prolineCount / length * 100).toFixed(1)),
    estimatedMW: parseFloat((length * 110 / 1000).toFixed(1)),
  };
}

function selectPositions(sequence, count) {
  const positions = new Set();
  const priority = new Set(['C','P','G','H','D','E']);
  for (let i = 0; i < sequence.length && positions.size < count; i++) {
    if (priority.has(sequence[i]) && Math.random() > 0.4) positions.add(i);
  }
  let attempts = 0;
  while (positions.size < Math.min(count, sequence.length) && attempts < 2000) {
    positions.add(Math.floor(Math.random() * sequence.length));
    attempts++;
  }
  return [...positions].slice(0, count);
}

export function generatePrediction(fastaInput, conditions) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const { header, sequence } = parseFASTA(fastaInput);
        const validation = validateSequence(sequence);
        if (!validation.valid) { reject(new Error(validation.error)); return; }

        const { temperature, ph } = conditions;
        const features = extractFeatures(sequence);
        const positions = selectPositions(sequence, 15);
        const tempStress = Math.abs(temperature - 37) / 63;
        const phStress = Math.abs(ph - 7.0) / 7.0;

        const mutations = positions.map((pos, idx) => {
          const original = sequence[pos];
          const prefs = SUBSTITUTION_PREFERENCES[original] || AMINO_ACIDS;
          const sub = prefs[Math.floor(Math.random() * prefs.length)];
          const base = 0.20 + Math.random() * 0.75;
          const stabilityScore = Math.min(0.99, Math.max(0.05,
            base + 0.06 - tempStress * 0.15 - phStress * 0.08
          ));
          const confidence = Math.min(0.99, Math.max(0.30, 0.45 + Math.random() * 0.50));
          const activityRisk = stabilityScore > 0.70 ? 'Low' : stabilityScore > 0.45 ? 'Medium' : 'High';
          const ddG = parseFloat((-2.5 + Math.random() * 5).toFixed(2));
          return {
            id: `m_${idx}`,
            mutation: `${original}${pos + 1}${sub}`,
            position: pos + 1,
            original,
            substitution: sub,
            stabilityScore: parseFloat(stabilityScore.toFixed(3)),
            confidence: parseFloat(confidence.toFixed(3)),
            activityRisk,
            ddG,
          };
        });

        mutations.sort((a, b) => b.stabilityScore - a.stabilityScore);
        mutations.forEach((m, i) => { m.rank = i + 1; });

        resolve({
          id: `pred_${Date.now()}`,
          header,
          sequence,
          features,
          mutations,
          conditions,
          timestamp: new Date().toISOString(),
          status: 'completed',
          model: 'EnzymeStability-v1.0 (Mock)',
        });
      } catch (err) {
        reject(err);
      }
    }, 2500);
  });
}
