import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import { Download, ArrowLeft, ChevronUp, ChevronDown, Trophy, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { exportToCSV } from '../services/exportService';
import api from '../services/apiClient';

function RiskBadge({ risk }) {
  if (risk === 'Low') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Low</span>;
  if (risk === 'Medium') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Medium</span>;
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">High</span>;
}

function ScoreBar({ value, color = '#3b82f6' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-gray-600 w-8 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function HotspotMap({ sequence, mutations = [], hotspotMap = [] }) {
  const [hovered, setHovered] = useState(null);

  // Support both old shape (mutations array) and new shape (hotspotMap array)
  const posMap = useMemo(() => {
    const m = {};
    if (hotspotMap.length > 0) {
      hotspotMap.forEach(h => { m[h.position] = h; });
    } else {
      mutations.forEach(mut => { m[mut.position] = mut; });
    }
    return m;
  }, [mutations, hotspotMap]);

  const getColor = (entry) => {
    if (!entry) return '#e2e8f0';
    const score = entry.stabilizationPotential ?? entry.stabilityScore ?? 0;
    if (score > 0.65) return '#22c55e';
    if (score > 0.40) return '#f59e0b';
    return '#ef4444';
  };

  const positions = sequence.split('').map((aa, i) => ({ pos: i + 1, aa, entry: posMap[i + 1] }));
  const COLS = 25;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
        {positions.map(({ pos, aa, entry }) => (
          <div
            key={pos}
            style={{
              width: 14, height: 14,
              borderRadius: 2,
              backgroundColor: getColor(entry),
              cursor: entry ? 'pointer' : 'default',
              outline: hovered?.pos === pos ? '2px solid #1d4ed8' : 'none',
              flexShrink: 0,
            }}
            onMouseEnter={() => setHovered({ pos, aa, entry })}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
          <span>High stability (&gt;70%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
          <span>Medium (45–70%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
          <span>Low (&lt;45%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#e2e8f0' }} />
          <span>Not mutated</span>
        </div>
      </div>

      {hovered && (
        <div className="mt-2 p-2.5 bg-slate-800 text-white text-xs rounded-lg inline-block">
          <span className="font-mono">Position {hovered.pos} · {hovered.aa}</span>
          {hovered.entry && (
            <span className="ml-2">
              {hovered.entry.mutation ? `→ ${hovered.entry.mutation} · ` : ''}
              Potential: {((hovered.entry.stabilizationPotential ?? hovered.entry.stabilityScore ?? 0) * 100).toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const SORT_FIELDS = {
  rank: (a, b) => a.rank - b.rank,
  mutation: (a, b) => a.mutation.localeCompare(b.mutation),
  ddG: (a, b) => (a.ddG ?? Infinity) - (b.ddG ?? Infinity),   // most negative = rank 1
  predictedStabilityChange: (a, b) => (b.predictedStabilityChange ?? -Infinity) - (a.predictedStabilityChange ?? -Infinity),
  activityRisk: (a, b) => (a.activityRisk ?? 0) - (b.activityRisk ?? 0),
  supportingVariants: (a, b) => (b.supportingVariants ?? 0) - (a.supportingVariants ?? 0),
};

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let timer;

    const fetch = () =>
      api.get(`/predictions/${id}`)
        .then(({ prediction }) => {
          setPrediction(prediction);
          // Keep polling if still processing
          if (prediction.status === 'QUEUED' || prediction.status === 'RUNNING') {
            timer = setTimeout(fetch, 2000);
          } else {
            setLoading(false);
          }
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });

    fetch();
    return () => clearTimeout(timer);
  }, [id]);

  if (loading || prediction?.status === 'QUEUED' || prediction?.status === 'RUNNING') {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-gray-400 min-h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm font-medium text-gray-600">
          {prediction?.status === 'RUNNING' ? 'ML pipeline running...' :
           prediction?.status === 'QUEUED' ? 'Waiting in queue...' : 'Loading results...'}
        </p>
        <p className="text-xs text-gray-400">This usually takes a few seconds</p>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-400 mb-4">{error || 'Prediction not found'}</div>
        <button onClick={() => navigate('/dashboard')} className="text-blue-600 hover:text-blue-700 font-medium">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (prediction.status === 'FAILED') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center shadow-sm">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Prediction failed</h3>
          <p className="text-sm text-red-500 mb-4">
            {prediction.errorMessage || 'An unexpected error occurred during analysis.'}
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Common causes: non-standard amino acid codes in the sequence, or sequence too short (minimum 5 residues).
          </p>
          <button onClick={() => navigate('/predict')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
            Try a new prediction
          </button>
        </div>
      </div>
    );
  }

  // Mongoose stores candidates + hotspotMap directly on the prediction document
  const conditions = prediction.conditions || {};
  const mutations = prediction.candidates || [];

  if (mutations.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="bg-white rounded-xl border border-amber-100 p-8 text-center shadow-sm">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">No candidates generated</h3>
          <p className="text-sm text-gray-500 mb-4">
            The prediction completed but produced no mutation candidates. This usually means the prediction
            was created before the current engine version. Try running a new prediction.
          </p>
          <button onClick={() => navigate('/predict')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
            New Prediction
          </button>
        </div>
      </div>
    );
  }
  const hotspotMap = prediction.hotspotMap || [];
  const sequence = prediction.fastaSequence?.replace(/^>.*\n/, '').replace(/\s/g, '') || '';
  const header = prediction.fastaSequence?.split('\n')[0]?.replace('>', '') || `Prediction ${String(id).slice(-8)}`;

  const sorted = [...mutations].sort((a, b) => {
    const r = SORT_FIELDS[sortKey]?.(a, b) ?? 0;
    return sortAsc ? r : -r;
  });

  const chartData = mutations.slice(0, 10).map(m => ({
    name: m.mutation,
    stability: parseFloat(((m.predictedStabilityChange ?? m.stabilityScore ?? 0) * 10 + 50).toFixed(1)),
    confidence: parseFloat(((m.confidence ?? 0.5) * 100).toFixed(1)),
  }));

  const handleSort = (key) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'rank'); }
  };

  const SortIcon = ({ field }) => {
    if (field !== sortKey) return <ChevronUp className="w-3 h-3 text-gray-300" />;
    return sortAsc ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />;
  };

  const medalColors = ['bg-yellow-50 border-yellow-200', 'bg-gray-50 border-gray-200', 'bg-orange-50 border-orange-200'];
  const medalText = ['text-yellow-600', 'text-gray-500', 'text-orange-500'];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <button onClick={() => exportToCSV(prediction)}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Metadata card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{header}</h2>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
              {conditions.temperature && <><span className="flex items-center gap-1">T = <strong className="text-gray-700">{conditions.temperature}°C</strong></span><span>·</span></>}
              {conditions.ph && <><span>pH <strong className="text-gray-700">{conditions.ph}</strong></span><span>·</span></>}
              {conditions.solvent && <><span><strong className="text-gray-700">{conditions.solvent}</strong> solvent</span><span>·</span></>}
              {conditions.ionicStrength && <span>Ionic strength <strong className="text-gray-700">{conditions.ionicStrength} M</strong></span>}
            </div>
          </div>
          <div className="text-right text-sm text-gray-400 flex-shrink-0">
            <div>{new Date(prediction.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div className="text-xs mt-0.5">{prediction.modelVersion || prediction.tier + ' tier'}</div>
            {prediction.similarityWarning && (
              <div className="flex items-center gap-1 text-amber-500 text-xs mt-1">
                <AlertTriangle className="w-3 h-3" />
                Low similarity to training data
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
          {[
            { label: 'Sequence length', value: sequence ? `${sequence.length} aa` : '—' },
            { label: 'Candidates', value: mutations.length },
            { label: 'Tier', value: prediction.tier },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-sm font-semibold text-gray-900">{value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 3 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Top Mutations</h3>
        <div className="grid grid-cols-3 gap-4">
          {mutations.slice(0, 3).map((m, i) => (
            <div key={m.rank} className={`rounded-xl border p-4 ${medalColors[i]}`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${medalText[i]}`}>
                  <Trophy className="w-3.5 h-3.5" />
                  Rank #{m.rank}
                </div>
                {m.activityRisk != null && <RiskBadge risk={m.activityRisk <= 0.3 ? 'Low' : m.activityRisk <= 0.6 ? 'Medium' : 'High'} />}
              </div>
              <div className="text-xl font-mono font-bold text-gray-900 mb-3">{m.mutation}</div>

              {m.ddG != null ? (
                <div className="space-y-2.5">
                  {/* ddG — primary metric */}
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">ddG (kcal/mol)</div>
                    <div className={`text-lg font-bold font-mono ${m.ddG < 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {m.ddG >= 0 ? '+' : ''}{m.ddG.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-400">more negative = more stable</div>
                  </div>
                  {/* dTm */}
                  {m.predictedStabilityChange != null && (
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Predicted dTm</div>
                      <div className={`text-sm font-semibold ${m.predictedStabilityChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {m.predictedStabilityChange >= 0 ? '+' : ''}{m.predictedStabilityChange.toFixed(2)} °C
                      </div>
                    </div>
                  )}
                  {/* CI */}
                  {m.confidenceLow != null && (
                    <div className="text-xs text-gray-500">
                      95% CI: <span className="font-mono text-gray-700">[{m.confidenceLow.toFixed(2)}, {m.confidenceHigh.toFixed(2)}]</span>
                    </div>
                  )}
                  {/* Activity risk */}
                  {m.activityRisk != null && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Activity Risk</div>
                      <ScoreBar value={m.activityRisk} color="#f59e0b" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic mt-2">
                  Quantitative scores available on Silver / Gold tier
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Stability & Confidence — Top 10</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: -15, bottom: 55 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, n) => [`${v}%`, n === 'stability' ? 'Stability' : 'Confidence']} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="stability" name="Stability" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="confidence" name="Confidence" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Hotspot Map — Sequence Positions</h3>
          <p className="text-xs text-gray-400 mb-3">Each square = one residue. Color indicates stabilization potential.</p>
          {hotspotMap.length > 0
            ? <HotspotMap sequence={sequence} hotspotMap={hotspotMap} />
            : <HotspotMap sequence={sequence} mutations={mutations} />
          }
        </div>
      </div>

      {/* Full table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">All Candidates ({mutations.length})</h3>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Info className="w-3.5 h-3.5" />
            Click column headers to sort
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-gray-100 bg-gray-50">
                {[
                  { id: 'rank',     sortKey: 'rank',                     label: 'Rank' },
                  { id: 'mutation', sortKey: 'mutation',                  label: 'Mutation' },
                  { id: 'ddG',      sortKey: 'ddG',                      label: 'ddG (kcal/mol)' },
                  { id: 'dtm',      sortKey: 'predictedStabilityChange',  label: 'dTm (°C)' },
                  { id: 'ci',       sortKey: null,                        label: 'CI [low, high]' },
                  { id: 'risk',     sortKey: 'activityRisk',              label: 'Activity Risk' },
                  { id: 'support',  sortKey: 'supportingVariants',        label: 'Supporting' },
                ].map(({ id, sortKey: sk, label }) => (
                  <th key={id}
                    onClick={() => sk && handleSort(sk)}
                    className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider select-none ${sk ? 'cursor-pointer hover:text-gray-700' : ''}`}>
                    <div className="flex items-center gap-1">
                      {label}
                      {sk && <SortIcon field={sk} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(m => (
                <tr key={m.rank} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500">#{m.rank}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="font-mono font-semibold text-gray-900">{m.mutation}</span>
                    <span className="ml-2 text-xs text-gray-400">pos {m.position}</span>
                    {m.structuralReason && (
                      <div className="text-xs text-gray-400 mt-0.5 leading-relaxed truncate" title={m.structuralReason}>
                        {m.structuralReason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.ddG != null
                      ? <span className={`text-sm font-mono font-medium ${m.ddG < 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {m.ddG >= 0 ? '+' : ''}{m.ddG.toFixed(2)}
                        </span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {m.predictedStabilityChange != null
                      ? <span className={`text-sm font-medium ${m.predictedStabilityChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {m.predictedStabilityChange >= 0 ? '+' : ''}{m.predictedStabilityChange.toFixed(2)} °C
                        </span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {m.confidenceLow != null
                      ? `[${m.confidenceLow.toFixed(1)}, ${m.confidenceHigh.toFixed(1)}]`
                      : '—'
                    }
                  </td>
                  <td className="px-4 py-3">
                    {m.activityRisk != null
                      ? <RiskBadge risk={m.activityRisk <= 0.3 ? 'Low' : m.activityRisk <= 0.6 ? 'Medium' : 'High'} />
                      : <span className="text-gray-400 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {m.supportingVariants != null ? m.supportingVariants : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
