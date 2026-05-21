import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ResponsiveContainer
} from 'recharts';
import { Download, ArrowLeft, ChevronUp, ChevronDown, Trophy, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { exportToCSV } from '../services/exportService';

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

function HotspotMap({ sequence, mutations }) {
  const [hovered, setHovered] = useState(null);
  const mutMap = useMemo(() => {
    const m = {};
    mutations.forEach(mut => { m[mut.position] = mut; });
    return m;
  }, [mutations]);

  const getColor = (mut) => {
    if (!mut) return '#e2e8f0';
    if (mut.stabilityScore > 0.70) return '#22c55e';
    if (mut.stabilityScore > 0.45) return '#f59e0b';
    return '#ef4444';
  };

  const positions = sequence.split('').map((aa, i) => ({ pos: i + 1, aa, mut: mutMap[i + 1] }));
  const COLS = 25;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
        {positions.map(({ pos, aa, mut }) => (
          <div
            key={pos}
            style={{
              width: 14, height: 14,
              borderRadius: 2,
              backgroundColor: getColor(mut),
              cursor: mut ? 'pointer' : 'default',
              outline: hovered?.pos === pos ? '2px solid #1d4ed8' : 'none',
              flexShrink: 0,
            }}
            onMouseEnter={() => setHovered({ pos, aa, mut })}
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
          {hovered.mut && (
            <span className="ml-2">→ <strong>{hovered.mut.mutation}</strong> · Stability: {(hovered.mut.stabilityScore * 100).toFixed(0)}% · {hovered.mut.activityRisk} risk</span>
          )}
        </div>
      )}
    </div>
  );
}

const SORT_FIELDS = {
  rank: (a, b) => a.rank - b.rank,
  mutation: (a, b) => a.mutation.localeCompare(b.mutation),
  stabilityScore: (a, b) => b.stabilityScore - a.stabilityScore,
  confidence: (a, b) => b.confidence - a.confidence,
  activityRisk: (a, b) => { const o = { Low: 0, Medium: 1, High: 2 }; return o[a.activityRisk] - o[b.activityRisk]; },
  ddG: (a, b) => a.ddG - b.ddG,
};

export default function Results() {
  const { id } = useParams();
  const { getPrediction } = useApp();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState('rank');
  const [sortAsc, setSortAsc] = useState(true);

  const prediction = getPrediction(id);

  if (!prediction) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-400 mb-4">Prediction not found</div>
        <button onClick={() => navigate('/dashboard')} className="text-blue-600 hover:text-blue-700 font-medium">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const { header, sequence, features, mutations, conditions, timestamp, model } = prediction;

  const sorted = [...mutations].sort((a, b) => {
    const r = SORT_FIELDS[sortKey]?.(a, b) ?? 0;
    return sortAsc ? r : -r;
  });

  const chartData = mutations.slice(0, 10).map(m => ({
    name: m.mutation,
    stability: parseFloat((m.stabilityScore * 100).toFixed(1)),
    confidence: parseFloat((m.confidence * 100).toFixed(1)),
  }));

  const handleSort = (key) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'rank'); }
  };

  const SortIcon = ({ field }) => {
    if (field !== sortKey) return <ChevronUp className="w-3 h-3 text-gray-300" />;
    return sortAsc ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />;
  };

  const top3 = mutations.slice(0, 3);
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
              <span className="flex items-center gap-1">T = <strong className="text-gray-700">{conditions.temperature}°C</strong></span>
              <span>·</span>
              <span>pH <strong className="text-gray-700">{conditions.ph}</strong></span>
              <span>·</span>
              <span><strong className="text-gray-700">{conditions.solvent}</strong> solvent</span>
              <span>·</span>
              <span>Ionic strength <strong className="text-gray-700">{conditions.ionicStrength} M</strong></span>
            </div>
          </div>
          <div className="text-right text-sm text-gray-400 flex-shrink-0">
            <div>{new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div className="text-xs mt-0.5">{model}</div>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-3 mt-4 pt-4 border-t border-gray-100">
          {[
            { label: 'Length', value: `${features.length} aa` },
            { label: 'Est. MW', value: `${features.estimatedMW} kDa` },
            { label: 'Charged residues', value: `${features.chargedFraction}%` },
            { label: 'Aromatic', value: features.aromaticResidues },
            { label: 'Proline', value: `${features.prolineContent}%` },
            { label: 'Hydrophobicity', value: features.avgHydrophobicity },
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
          {top3.map((m, i) => (
            <div key={m.id} className={`rounded-xl border p-4 ${medalColors[i]}`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${medalText[i]}`}>
                  <Trophy className="w-3.5 h-3.5" />
                  Rank #{m.rank}
                </div>
                <RiskBadge risk={m.activityRisk} />
              </div>
              <div className="text-xl font-mono font-bold text-gray-900 mb-3">{m.mutation}</div>
              <div className="space-y-1.5">
                <div className="text-xs text-gray-500 mb-1">Stability Score</div>
                <ScoreBar value={m.stabilityScore} color="#3b82f6" />
                <div className="text-xs text-gray-500 mt-1.5 mb-1">Confidence</div>
                <ScoreBar value={m.confidence} color="#8b5cf6" />
              </div>
              <div className="text-xs text-gray-500 mt-2.5">
                ΔΔG = <span className={`font-semibold ${m.ddG < 0 ? 'text-green-600' : 'text-red-500'}`}>{m.ddG > 0 ? '+' : ''}{m.ddG} kcal/mol</span>
              </div>
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
          <p className="text-xs text-gray-400 mb-3">Each square = one residue. Color indicates mutation stability score.</p>
          <HotspotMap sequence={sequence} mutations={mutations} />
        </div>
      </div>

      {/* Full table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">All Mutations ({mutations.length})</h3>
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
                  { key: 'rank', label: 'Rank' },
                  { key: 'mutation', label: 'Mutation' },
                  { key: 'stabilityScore', label: 'Stability Score' },
                  { key: 'confidence', label: 'Confidence' },
                  { key: 'activityRisk', label: 'Activity Risk' },
                  { key: 'ddG', label: 'ΔΔG (kcal/mol)' },
                ].map(({ key, label }) => (
                  <th key={key} onClick={() => handleSort(key)}
                    className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none">
                    <div className="flex items-center gap-1">
                      {label}
                      <SortIcon field={key} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500">#{m.rank}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-gray-900">{m.mutation}</span>
                    <span className="ml-2 text-xs text-gray-400">pos {m.position}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${m.stabilityScore * 100}%` }} />
                      </div>
                      <span className="text-sm text-gray-700">{(m.stabilityScore * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-purple-400" style={{ width: `${m.confidence * 100}%` }} />
                      </div>
                      <span className="text-sm text-gray-700">{(m.confidence * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><RiskBadge risk={m.activityRisk} /></td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${m.ddG < 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {m.ddG > 0 ? '+' : ''}{m.ddG}
                    </span>
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
