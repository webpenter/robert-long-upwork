import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  Download, ArrowLeft, AlertTriangle, Loader2,
  Zap, Thermometer, Info, CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../services/apiClient';

// ── Stability scale constants ─────────────────────────────────────────────────
// Client convention: NEGATIVE ΔG = more stable. No qualitative text labels — number only.
const DG_MIN = -10;
const DG_MAX =  10;

// Colour purely by sign for at-a-glance reading (no text label).
function dgColor(dg) {
  if (dg <= -0.5) return '#16a34a';   // stable  → green
  if (dg >=  0.5) return '#dc2626';   // unstable → red
  return '#ca8a04';                   // near-neutral → amber
}

// ── ΔG Gauge ─────────────────────────────────────────────────────────────────
function DgGauge({ dg }) {
  const clampedPct = Math.max(0, Math.min(100, ((dg - DG_MIN) / (DG_MAX - DG_MIN)) * 100));

  return (
    <div className="space-y-2">
      {/* gradient bar: left (negative) = stable/green, right (positive) = unstable/red */}
      <div className="relative h-5 rounded-full overflow-hidden"
        style={{ background: 'linear-gradient(to right, #15803d 0%, #16a34a 35%, #ca8a04 50%, #ea580c 65%, #dc2626 100%)' }}>
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
      <div className="flex justify-between text-[11px] text-gray-400 px-0.5">
        <span>← more stable</span>
        <span>less stable →</span>
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

// ── Suggested stabilizing mutations (residue-level ΔΔG scan) ───────────────────
function StabilizingMutations({ candidates }) {
  if (!candidates?.length) return null;
  const top = candidates.slice(0, 15).map(c => ({ name: c.mutation, ddG: c.ddG }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">Suggested Stabilizing Mutations</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Single-point ΔΔG scan across every position. <span className="text-green-600 font-medium">Negative ΔΔG = stabilizing</span> (lowers ΔG). Ranked best first.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={top} margin={{ top: 5, right: 10, left: -10, bottom: 45 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
          <YAxis tick={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke="#9ca3af" />
          <Tooltip formatter={(v) => [`${v} kcal/mol`, 'ΔΔG']} />
          <Bar dataKey="ddG" radius={[3, 3, 0, 0]}>
            {top.map((d, i) => <Cell key={i} fill={d.ddG < 0 ? '#16a34a' : '#dc2626'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100 bg-gray-50">
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mutation</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Position</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">ΔΔG (kcal/mol)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {candidates.slice(0, 30).map(c => (
              <tr key={c.rank} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-500">#{c.rank}</td>
                <td className="px-3 py-2 font-mono font-semibold text-gray-900">{c.mutation}</td>
                <td className="px-3 py-2 text-gray-600">{c.position}</td>
                <td className="px-3 py-2 font-mono font-medium" style={{ color: c.ddG < 0 ? '#16a34a' : '#dc2626' }}>
                  {c.ddG > 0 ? '+' : ''}{c.ddG?.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      prediction.seqLen ?? '',
      prediction.modelVersion ?? '',
    ];
    const csv = 'id,created_at,dG_kcal_mol,seq_len,model_version\n' + row.join(',');
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
    const color = dgColor(prediction.dG);

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
                style={{ color }}>
                {prediction.dG >= 0 ? '+' : ''}{prediction.dG.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500 mt-1">kcal / mol</div>
            </div>

            {/* Gauge + explanation */}
            <div className="flex-1 min-w-0">
              <DgGauge dg={prediction.dG} />
              <p className="text-xs text-gray-400 mt-3">
                <span className="font-medium text-gray-600">Interpretation:</span>{' '}
                More negative ΔG = more stable (folded state favoured).
                More positive ΔG = less stable.
              </p>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Thermometer, label: 'ΔG',         value: `${prediction.dG >= 0 ? '+' : ''}${prediction.dG.toFixed(2)} kcal/mol`, color },
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

        {/* Suggested stabilizing mutations (ΔΔG scan) */}
        <StabilizingMutations candidates={prediction.candidates} />

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
