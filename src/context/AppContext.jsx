import { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

const DEMO_MUTATIONS = [
  { id: 'm1', rank: 1, mutation: 'A92V', position: 92, original: 'A', substitution: 'V', stabilityScore: 0.924, confidence: 0.871, activityRisk: 'Low', ddG: -2.14 },
  { id: 'm2', rank: 2, mutation: 'L234I', position: 234, original: 'L', substitution: 'I', stabilityScore: 0.887, confidence: 0.834, activityRisk: 'Low', ddG: -1.87 },
  { id: 'm3', rank: 3, mutation: 'G67A', position: 67, original: 'G', substitution: 'A', stabilityScore: 0.854, confidence: 0.812, activityRisk: 'Low', ddG: -1.52 },
  { id: 'm4', rank: 4, mutation: 'K145R', position: 145, original: 'K', substitution: 'R', stabilityScore: 0.812, confidence: 0.789, activityRisk: 'Low', ddG: -1.21 },
  { id: 'm5', rank: 5, mutation: 'T78S', position: 78, original: 'T', substitution: 'S', stabilityScore: 0.779, confidence: 0.754, activityRisk: 'Low', ddG: -0.98 },
  { id: 'm6', rank: 6, mutation: 'D112N', position: 112, original: 'D', substitution: 'N', stabilityScore: 0.723, confidence: 0.701, activityRisk: 'Low', ddG: -0.67 },
  { id: 'm7', rank: 7, mutation: 'S201T', position: 201, original: 'S', substitution: 'T', stabilityScore: 0.654, confidence: 0.631, activityRisk: 'Medium', ddG: -0.34 },
  { id: 'm8', rank: 8, mutation: 'V89L', position: 89, original: 'V', substitution: 'L', stabilityScore: 0.612, confidence: 0.587, activityRisk: 'Medium', ddG: 0.12 },
  { id: 'm9', rank: 9, mutation: 'N167D', position: 167, original: 'N', substitution: 'D', stabilityScore: 0.534, confidence: 0.512, activityRisk: 'Medium', ddG: 0.45 },
  { id: 'm10', rank: 10, mutation: 'H223Q', position: 223, original: 'H', substitution: 'Q', stabilityScore: 0.487, confidence: 0.463, activityRisk: 'Medium', ddG: 0.78 },
  { id: 'm11', rank: 11, mutation: 'R45K', position: 45, original: 'R', substitution: 'K', stabilityScore: 0.423, confidence: 0.401, activityRisk: 'Medium', ddG: 1.12 },
  { id: 'm12', rank: 12, mutation: 'F156Y', position: 156, original: 'F', substitution: 'Y', stabilityScore: 0.378, confidence: 0.352, activityRisk: 'High', ddG: 1.45 },
  { id: 'm13', rank: 13, mutation: 'E190K', position: 190, original: 'E', substitution: 'K', stabilityScore: 0.312, confidence: 0.289, activityRisk: 'High', ddG: 1.87 },
  { id: 'm14', rank: 14, mutation: 'P56G', position: 56, original: 'P', substitution: 'G', stabilityScore: 0.256, confidence: 0.234, activityRisk: 'High', ddG: 2.21 },
  { id: 'm15', rank: 15, mutation: 'C34S', position: 34, original: 'C', substitution: 'S', stabilityScore: 0.189, confidence: 0.167, activityRisk: 'High', ddG: 2.67 },
];

const DEMO_PROJECTS = [
  { id: 'demo-proj-1', name: 'Trypsin Thermostability', description: 'Improving trypsin stability at 55°C for industrial biocatalysis', predictionCount: 8, createdAt: '2024-01-10T10:00:00Z' },
  { id: 'demo-proj-2', name: 'Lipase pH Tolerance', description: 'Engineering lipase for acidic processing conditions (pH 4.5)', predictionCount: 5, createdAt: '2024-01-15T14:30:00Z' },
  { id: 'demo-proj-3', name: 'Protease Salt Resistance', description: 'High ionic strength stability for industrial detergent applications', predictionCount: 12, createdAt: '2024-01-25T09:15:00Z' },
];

const DEMO_PREDICTIONS = [
  {
    id: 'demo-pred-1',
    projectId: 'demo-proj-1',
    header: 'sp|P00761|TRYP_PIG Trypsin OS=Sus scrofa',
    sequence: 'IVGGYTCGANTVPYQVSLNSGYHFCGGSLINSQWVVSAAHCYKSGIQVRLGEDNINVVEGNEQFISASKSIVHPSYNSNTLNNDIMLIKLKSAASLNSRVASISLPTSCASAGTQCLISGWGNTKSSGTSYPDVLKCLKAPILSDSSCKSAYWGSTKVKMVCAGGDGVRSRDLSKVSSTSKHITN',
    conditions: { temperature: 55, ph: 7.5, solvent: 'aqueous', ionicStrength: 0.15 },
    status: 'completed',
    createdAt: '2024-01-15T10:30:00Z',
    features: { length: 182, avgHydrophobicity: 0.812, chargedResidues: 38, chargedFraction: 20.9, aromaticResidues: 12, prolineContent: 3.3, estimatedMW: 20.0 },
    mutations: DEMO_MUTATIONS,
    model: 'EnzymeStability-v1.0 (Mock)',
  },
  {
    id: 'demo-pred-2',
    projectId: 'demo-proj-2',
    header: 'Candida antarctica Lipase B (CalB)',
    sequence: 'MSVVSTGQSVTMGHCISGDEFPGTSYLDLGGTPVVNALAIGPPAEGALHFAPSQELADLVGDRMARPMSAFNYTLNHTFGNMTRDYLSNYATLLGQDPQHLLLNVHPQWLSYIQANSATTTGHSLENALAIVQTLPQAAPM',
    conditions: { temperature: 37, ph: 4.5, solvent: 'aqueous', ionicStrength: 0.10 },
    status: 'completed',
    createdAt: '2024-01-20T14:30:00Z',
    features: { length: 141, avgHydrophobicity: 0.234, chargedResidues: 28, chargedFraction: 19.9, aromaticResidues: 8, prolineContent: 5.0, estimatedMW: 15.5 },
    mutations: DEMO_MUTATIONS.map((m, i) => ({ ...m, id: `dm2_${i}`, stabilityScore: Math.min(0.99, parseFloat((m.stabilityScore + 0.04).toFixed(3))), ddG: parseFloat((m.ddG - 0.3).toFixed(2)) })),
    model: 'EnzymeStability-v1.0 (Mock)',
  },
];

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [predictions, setPredictions] = useState([]);

  useEffect(() => {
    const sp = localStorage.getItem('enzml_projects');
    const sd = localStorage.getItem('enzml_predictions');
    if (sp) { setProjects(JSON.parse(sp)); } else { setProjects(DEMO_PROJECTS); localStorage.setItem('enzml_projects', JSON.stringify(DEMO_PROJECTS)); }
    if (sd) { setPredictions(JSON.parse(sd)); } else { setPredictions(DEMO_PREDICTIONS); localStorage.setItem('enzml_predictions', JSON.stringify(DEMO_PREDICTIONS)); }
  }, []);

  const addProject = (project) => {
    const newProject = { ...project, id: `proj_${Date.now()}`, createdAt: new Date().toISOString(), predictionCount: 0 };
    const updated = [newProject, ...projects];
    setProjects(updated);
    localStorage.setItem('enzml_projects', JSON.stringify(updated));
    return newProject;
  };

  const addPrediction = (prediction) => {
    const updated = [prediction, ...predictions];
    setPredictions(updated);
    localStorage.setItem('enzml_predictions', JSON.stringify(updated));
    if (prediction.projectId) {
      const updatedProjects = projects.map(p =>
        p.id === prediction.projectId ? { ...p, predictionCount: p.predictionCount + 1 } : p
      );
      setProjects(updatedProjects);
      localStorage.setItem('enzml_projects', JSON.stringify(updatedProjects));
    }
  };

  const getPrediction = (id) => predictions.find(p => p.id === id);

  return (
    <AppContext.Provider value={{ projects, predictions, addProject, addPrediction, getPrediction }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
