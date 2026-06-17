import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  Download, ArrowLeft, AlertTriangle, Loader2,
  Zap, Thermometer, Info, CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../services/apiClient';

// ── Stability scale constants ─────────────────────────────────────────────────
const DG_MIN  = -10;
const DG_MAX  =  10;
const ZONES   = [
  { lo: -10,  hi: -3.0, label: 'Highly Unstable', color: '#dc2626', bg: '#fef2f2', text: '#991b1b' },
  { lo:  -3.0, hi: -0.5, label: 'Unstable',        color: '#ea580c', bg: '#fff7ed', text: '#9a3412' },
  { lo:  -0.5, hi:  0.5, label: 'Marginally Stable', color: '#ca8a04', bg: '#fefce8', text: '#854d0e' },
  { lo:   0.5, hi:  3.0, label: 'Stable',           color: '#16a34a', bg: '#f0fdf4', text: '#166534' },
  { lo:   3.0, hi: 10,   label: 'Highly Stable',    color: '#15803d', bg: '#dcfce7', text: '#14532d' },
];

function getZone(dg) {
  return ZONES.find(z => dg >= z.lo && dg < z.hi) || ZONES[0];
}

// ── ΔG Gauge ─────────────────────────────────────────────────────────────────
function DgGauge({ dg }) {
  const clampedPct = Math.max(0, Math.min(100, ((dg - DG_MIN) / (DG_MAX - DG_MIN)) * 100));
  const zone = getZone(dg);

  return (
    <div className="space-y-3">
      {/* gradient bar */}
      <div className="relative h-5 rounded-full overflow-hidden"
        style={{ background: 'linear-gradient(to right, #dc2626 0%, #ea580c 20%, #ca8a04 40%, #16a34a 60%, #15803d 85%, #14532d 100%)' }}>
        {/* position marker */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-md rounded-full"
          style={{ left: `calc(${clampedPct}% - 2px)` }}
        />
      </div>

      {/* scale labels */}
      <div className="flex justify-between text-xs text-gray-400 px-0.5">
        {['-10', '-5', '-3', '0', '+3', '+5', '+10'].map(l => (
          <span key={l}>{l}</span>
        ))}
      </div>

      {/* zone labels */}
      <div className="flex gap-1 flex-wrap">
        {ZONES.map(z => (
          <span key={z.label}
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: z.label === zone.label ? z.color : z.bg,
              color:      z.label === zone.label ? '#fff' : z.text,
              fontWeight: z.label === zone.label ? 700 : 400,
            }}>
            {z.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Distribution bar for context ──────────────────────────────────────────────
function DgDistributionBar({ dg }) {
  const bins = [
    { range: '< −6',       count: 8,  lo: -19, hi: -6 },
    { range: '−6 to −3',   count: 18, lo: -6,  hi: -3 },
    { range: '−3 to −0.5', count: 22, lo: -3,  hi: -0.5 },
    { range: '−0.5 to 0.5',count: 12, lo: -0.5, hi: 0.5 },
    { range: '0.5 to 3',   count: 25, lo: 0.5,  hi: 3 },
    { range: '3 to 6',     count: 11, lo: 3,    hi: 6 },
    { range: '> 6',        count: 4,  lo: 6,    hi: 19 },
  ];

  const inBin = (b) => dg >= b.lo && dg < b.hi;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 font-medium">
        DMSv4 training distribution (455k sequences) — your prediction marked
      </p>
      <div className="flex items-end gap-1 h-12">
        {bins.map(b => (
          <div key={b.range} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height:     `${Math.round(b.count / 25 * 48)}px`,
                background: inBin(b) ? '#3b82f6' : '#e2e8f0',
              }}
            />
            {inBin(b) && (
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>−19</span>
        <span>0</span>
        <span>+17 kcal/mol</span>
      </div>
    </div>
  );
}

// ── Legacy mutation view (pre-Phase F predictions) ────────────────────────────
function LegacyMutationView({ prediction }) {
  const mutations = prediction.candidates || [];
  if (mutations.length === 0) return null;

  const chartData = mutations.slice(0, 10).map(m => ({
    name: m.mutation,
    dTm:  parseFloat((m.predictedStabilityChange ?? 0).toFixed(2)),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
        <Info className="w-4 h-4 flex-shrink-0" />
        This prediction was run with the legacy mutation-ranking engine (pre-Phase F).
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Predicted ΔTm — Top 10 Mutations</h3>
        <p className="text-xs text-gray-400 mb-3">Positive = predicted Tm increase (stabilising)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 10, left: -10, bottom: 55 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{ fontSize: 10 }} />
            <YAxis unit="°C" tick={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
            <Tooltip formatter={(v) => [`${v} °C`, 'ΔTm']} />
            <Bar dataKey="dTm" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">All Candidates ({mutations.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mutation</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">ddG (kcal/mol)</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">dTm (°C)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mutations.map(m => (
                <tr key={m.rank} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">#{m.rank}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-900">{m.mutation}</td>
                  <td className="px-4 py-3">
                    {m.ddG != null
                      ? <span className={`font-mono font-medium ${m.ddG < 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {m.ddG >= 0 ? '+' : ''}{m.ddG.toFixed(2)}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {m.predictedStabilityChange != null
                      ? <span className={`font-medium ${m.predictedStabilityChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {m.predictedStabilityChange >= 0 ? '+' : ''}{m.predictedStabilityChange.toFixed(2)} °C
                        </span>
                      : <span className="text-gray-300">—</span>}
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

// ── Main Results component ────────────────────────────────────────────────────
export default function Results() {
  const { id }         = useParams();
  const navigate       = useNavigate();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    let timer;
    const fetch = () =>
      api.get(`/predictions/${id}`)
        .then(({ prediction }) => {
          setPrediction(prediction);
          if (prediction.status === 'QUEUED' || prediction.status === 'RUNNING') {
            timer = setTimeout(fetch, 2000);
          } else {
            setLoading(false);
          }
        })
        .catch(err => { setError(err.message); setLoading(false); });
    fetch();
    return () => clearTimeout(timer);
  }, [id]);

  const handleExportCSV = () => {
    if (!prediction) return;
    const row = [
      prediction._id,
      new Date(prediction.createdAt).toISOString(),
      prediction.dG ?? '',
      prediction.stability ?? '',
      prediction.seqLen ?? '',
      prediction.modelVersion ?? '',
    ];
    const csv = 'id,created_at,dG_kcal_mol,stability,seq_len,model_version\n' + row.join(',');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = `prediction_${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Loading / polling ───────────────────────────────────────────────────
  if (loading || prediction?.status === 'QUEUED' || prediction?.status === 'RUNNING') {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-gray-400 min-h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm font-medium text-gray-600">
          {prediction?.status === 'RUNNING' ? 'Running CNN inference...' :
           prediction?.status === 'QUEUED'  ? 'Waiting in queue...' : 'Loading results...'}
        </p>
        <p className="text-xs text-gray-400">ProtStabCNN typically runs in &lt;50 ms</p>
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
      <div className="p-6 max-w-xl mx-auto">
        <button onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center shadow-sm">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-900 mb-2">Prediction failed</h3>
          <p className="text-sm text-red-500 mb-2">{prediction.errorMessage || 'Unexpected error'}</p>
          <p className="text-xs text-gray-400 mb-6">
            Common causes: non-standard amino acids, sequence &lt;10 residues, ML service offline.
          </p>
          <button onClick={() => navigate('/predict')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const header   = prediction.fastaSequence?.split('\n')[0]?.replace('>', '') || `Prediction ${String(id).slice(-8)}`;
  const hasNewDg = prediction.dG != null;
  const hasCands = (prediction.candidates?.length ?? 0) > 0;

  // ── ΔG results view (Phase F+) ──────────────────────────────────────────
  if (hasNewDg) {
    const zone = getZone(prediction.dG);

    return (
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 truncate">{header}</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {new Date(prediction.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            {' · '}{prediction.modelVersion || 'protstab_cnn_v0'}
          </p>
        </div>

        {/* Main result card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start gap-6">
            {/* ΔG primary value */}
            <div className="text-center flex-shrink-0 min-w-32">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Predicted ΔG
              </div>
              <div
                className="text-5xl font-bold font-mono"
                style={{ color: zone.color }}>
                {prediction.dG >= 0 ? '+' : ''}{prediction.dG.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500 mt-1">kcal / mol</div>
              <span
                className="inline-block mt-3 px-3 py-1 rounded-full text-sm font-semibold"
                style={{ background: zone.bg, color: zone.text }}>
                {zone.label}
              </span>
            </div>

            {/* Gauge + explanation */}
            <div className="flex-1 min-w-0">
              <DgGauge dg={prediction.dG} />
              <p className="text-xs text-gray-400 mt-3">
                <span className="font-medium text-gray-600">Interpretation:</span>{' '}
                Positive ΔG = thermodynamically stable (folded state favoured).
                Negative ΔG = unstable (unfolded state favoured under standard conditions).
                Training data mean = +1.82 kcal/mol.
              </p>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: Thermometer, label: 'ΔG',         value: `${prediction.dG >= 0 ? '+' : ''}${prediction.dG.toFixed(2)} kcal/mol`, color: zone.color },
            { icon: CheckCircle2, label: 'Classification', value: zone.label, color: zone.color },
            { icon: Zap,         label: 'Sequence Length', value: `${prediction.seqLen ?? '—'} aa${prediction.truncated ? ' (truncated)' : ''}`, color: '#6b7280' },
            { icon: Info,        label: 'Inference Time',  value: prediction.latencyMs != null ? `${prediction.latencyMs} ms` : '—', color: '#6b7280' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
              </div>
              <div className="text-sm font-bold text-gray-900">{value}</div>
            </div>
          ))}
        </div>

        {/* Training distribution context */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Training Data Context</h3>
          <DgDistributionBar dg={prediction.dG} />
        </div>

        {/* Truncation warning */}
        {prediction.truncated && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Sequence truncated to 256 aa</p>
              <p className="text-xs text-amber-700 mt-0.5">
                ProtStabCNN was trained on sequences ≤ 256 residues. The first 256 amino acids were used for prediction.
                Phase 2 (ESM2-35M fine-tune) will support longer sequences.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Legacy mutation view (old predictions) ──────────────────────────────
  if (hasCands) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
        <h2 className="text-xl font-bold text-gray-900">{header}</h2>
        <LegacyMutationView prediction={prediction} />
      </div>
    );
  }

  // ── No data ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-xl mx-auto">
      <button onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-sm">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
        <h3 className="font-semibold text-gray-900 mb-2">No results available</h3>
        <p className="text-sm text-gray-500 mb-6">
          This prediction completed but contains no results. Try running a new prediction.
        </p>
        <button onClick={() => navigate('/predict')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium">
          New Prediction
        </button>
      </div>
    </div>
  );
}
