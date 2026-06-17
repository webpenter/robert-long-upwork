import { useState, useEffect, useCallback } from 'react';
import {
  Database, RefreshCw, AlertCircle, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Cpu, FlaskConical, Layers,
  CheckCircle2, Clock, Zap,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
  ScatterChart, Scatter, LineChart, Line,
} from 'recharts';
import api from '../services/apiClient';
import { useAuth } from '../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v, d = 3) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(d);
}

function pctBar(v, color = '#3b82f6') {
  const pct = Math.max(0, Math.min(1, v ?? 0)) * 100;
  return (
    <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const ALG_COLORS = {
  RandomForest: '#10b981',
  GradBoost:    '#3b82f6',
  Ridge:        '#f59e0b',
  ProtStabCNN:  '#8b5cf6',
};

const CV_METRIC_LABELS = {
  cv_r2:   'R²',
  cv_rmse: 'RMSE',
  cv_pcc:  'Pearson r',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusChip({ label, active, color = 'blue' }) {
  const on  = active ? `bg-${color}-100 text-${color}-700 border-${color}-300` : 'bg-gray-50 text-gray-400 border-gray-200';
  const dot = active ? `bg-${color}-500` : 'bg-gray-300';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${on}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function KPICard({ label, value, sub, accent = 'blue' }) {
  const themes = {
    blue:   'from-blue-500/10  border-blue-200  text-blue-700',
    green:  'from-green-500/10 border-green-200 text-green-700',
    amber:  'from-amber-500/10 border-amber-200 text-amber-700',
    violet: 'from-violet-500/10 border-violet-200 text-violet-700',
    slate:  'from-slate-500/10 border-slate-200 text-slate-700',
  };
  return (
    <div className={`bg-gradient-to-br ${themes[accent]} to-white border rounded-xl p-4 flex flex-col gap-1`}>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</span>
      <span className="text-2xl font-bold leading-none">{value}</span>
      {sub && <span className="text-xs opacity-60 mt-0.5">{sub}</span>}
    </div>
  );
}

function AlgorithmComparisonChart({ cvResults, proteinCvResults }) {
  if (!cvResults || !proteinCvResults) return null;

  const algs = Object.keys(cvResults);
  const data = algs.map(alg => ({
    name:           alg === 'ProtStabCNN' ? 'CNN' : alg.replace('RandomForest', 'RF').replace('GradBoost', 'GB'),
    fullName:       alg,
    randomR2:       +(cvResults[alg]?.cv_r2 ?? 0).toFixed(3),
    proteinR2:      +(proteinCvResults[alg]?.cv_r2 ?? 0).toFixed(3),
    randomRMSE:     +(cvResults[alg]?.cv_rmse ?? 0).toFixed(3),
    proteinRMSE:    +(proteinCvResults[alg]?.cv_rmse ?? 0).toFixed(3),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          R² by algorithm — random vs protein-held-out CV
        </h4>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ left: 0, right: 10, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[-0.1, 1]} tick={{ fontSize: 11 }} tickCount={6} />
            <Tooltip
              formatter={(v, name) => [v.toFixed(3), name]}
              contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 2" />
            <Bar dataKey="randomR2"  name="Random-CV R²"  fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="proteinR2" name="Protein-CV R²" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          RMSE (kcal/mol) — lower is better
        </h4>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ left: 0, right: 10, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => [`${v.toFixed(3)} kcal/mol`, name]}
              contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="randomRMSE"  name="Random-CV RMSE"  fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="proteinRMSE" name="Protein-CV RMSE" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProteinStatsTable({ proteinStats }) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey,  setSortKey]  = useState('nVariants');
  const [sortAsc,  setSortAsc]  = useState(false);

  if (!proteinStats?.length) {
    return (
      <p className="text-sm text-gray-400 italic">
        Per-protein stats not available in current model. Retrain to generate them.
      </p>
    );
  }

  const sorted = [...proteinStats].sort((a, b) =>
    sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
  );
  const shown = expanded ? sorted : sorted.slice(0, 8);

  function toggleSort(key) {
    if (key === sortKey) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const maxN = Math.max(...proteinStats.map(p => p.nVariants));

  function SortIcon({ col }) {
    if (col !== sortKey) return null;
    return sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-100">
            <th className="text-left pb-2 font-semibold">Protein</th>
            {[
              ['nVariants',  'Variants'],
              ['meanDdg',    'Mean ΔΔG'],
              ['minDdg',     'Min ΔΔG'],
              ['maxDdg',     'Max ΔΔG'],
            ].map(([key, label]) => (
              <th key={key}
                className="text-right pb-2 font-semibold cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort(key)}
              >
                <span className="inline-flex items-center gap-0.5 justify-end">
                  {label}<SortIcon col={key} />
                </span>
              </th>
            ))}
            <th className="text-left pb-2 font-semibold pl-4">Coverage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {shown.map(p => (
            <tr key={p.protein} className="hover:bg-gray-50">
              <td className="py-2 font-mono text-xs text-gray-800 max-w-[120px] truncate">{p.protein}</td>
              <td className="py-2 text-right text-gray-700">{p.nVariants}</td>
              <td className="py-2 text-right font-mono text-gray-600">{fmt(p.meanDdg, 3)}</td>
              <td className="py-2 text-right font-mono text-red-600">{fmt(p.minDdg, 3)}</td>
              <td className="py-2 text-right font-mono text-green-600">{fmt(p.maxDdg, 3)}</td>
              <td className="py-2 pl-4">
                <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${(p.nVariants / maxN) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {proteinStats.length > 8 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" />Show less</>
            : <><ChevronDown className="w-3.5 h-3.5" />Show all {proteinStats.length} proteins</>}
        </button>
      )}
    </div>
  );
}

function MutationCard({ mutation, rank, type }) {
  const ddg     = mutation.actual_ddg ?? 0;
  const isStab  = type === 'stabilising';
  const color   = isStab ? 'text-green-700 bg-green-50 border-green-200'
                          : 'text-red-700 bg-red-50 border-red-200';
  const ddgColor = isStab ? 'text-green-600' : 'text-red-600';

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${color}`}>
      <span className="font-bold w-5 text-center opacity-50">#{rank}</span>
      <span className="font-mono font-semibold">{mutation.mutation}</span>
      <span className="opacity-60 text-xs truncate flex-1">{mutation.protein}</span>
      <span className={`font-mono font-bold ${ddgColor}`}>{ddg >= 0 ? '+' : ''}{fmt(ddg, 3)}</span>
      <span className="opacity-50 text-xs">kcal/mol</span>
    </div>
  );
}

function PhaseRoadmap({ stats }) {
  const phases = [
    {
      id: 'A',
      label: 'Phase A — Physicochemical',
      desc: 'BLOSUM62, KD hydrophobicity, volume, charge, burial, one-hot encoding',
      done: true,
      metrics: `${stats?.nFeatures ?? 60} features`,
    },
    {
      id: 'B',
      label: 'Phase B — Structural (S1724)',
      desc: 'Real RSA & SST from PDB annotations; Chou-Fasman proxy at inference',
      done: true,
      metrics: `${stats?.nVariants ?? 0} variants, ${stats?.nProteins ?? 0} proteins`,
    },
    {
      id: 'C',
      label: 'Phase C — ESM-2 Masked Marginals',
      desc: 'Log-likelihood ratio from ESM-2 masked-LM for sequence-aware scoring',
      done: stats?.esmUsed ?? false,
      metrics: stats?.esmUsed ? 'ESM-2 35M active' : 'torch+transformers needed',
    },
    {
      id: 'D1',
      label: 'Step 10 — ProtStabCNN',
      desc: 'MLP over 25-residue sequence window (506-dim); compared vs GradBoost/RF/Ridge',
      done: stats?.cnnTrained ?? false,
      metrics: stats?.cnnUsed ? 'Best model' : (stats?.cnnTrained ? 'Trained, not best' : 'Use --use-cnn'),
    },
    {
      id: 'D2',
      label: 'Step 11 — DMS v7 Augmentation',
      desc: 'Deep Mutational Scanning dataset (~900k sequences, Bayesian K50→ΔG)',
      done: (stats?.nDmsVariants ?? 0) > 0,
      metrics: stats?.nDmsVariants > 0 ? `+${stats.nDmsVariants} DMS variants` : 'Place CSVs in client-data/dms/',
    },
    {
      id: 'D3',
      label: 'Step 12 — ESM2-35M Upgrade',
      desc: 'Upgraded from 8M→35M parameter ESM-2 (3× parameters, better cross-protein)',
      done: true,
      metrics: 'facebook/esm2_t12_35M_UR50D configured',
    },
  ];

  return (
    <div className="space-y-2">
      {phases.map(p => (
        <div key={p.id}
          className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-sm
            ${p.done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
        >
          <span className={`mt-0.5 flex-shrink-0 ${p.done ? 'text-green-600' : 'text-gray-300'}`}>
            {p.done ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className={`font-medium text-xs ${p.done ? 'text-green-800' : 'text-gray-500'}`}>
              {p.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{p.desc}</div>
          </div>
          <span className={`text-xs font-mono flex-shrink-0 ${p.done ? 'text-green-600' : 'text-gray-400'}`}>
            {p.metrics}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DatasetExplorer() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [stats,   setStats]   = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  const [retraining,    setRetraining]    = useState(false);
  const [retrainOpts,   setRetrainOpts]   = useState({ useCnn: false, augmentDms: false });
  const [retrainResult, setRetrainResult] = useState(null);
  const [retrainError,  setRetrainError]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/ml/dataset-stats');
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdvancedRetrain() {
    setRetraining(true);
    setRetrainResult(null);
    setRetrainError(null);
    try {
      const result = await api.post('/ml/retrain-advanced', retrainOpts);
      setRetrainResult(result);
      await load();
    } catch (err) {
      setRetrainError(err.message);
    } finally {
      setRetraining(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        <div className="h-10 w-72 bg-gray-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
            <Database className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Dataset Explorer</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {stats && (
                <>
                  <span className="text-xs font-mono text-gray-400">{stats.modelVersion}</span>
                  <StatusChip label="ESM-2 35M" active={stats.esmUsed}   color="blue"   />
                  <StatusChip label="ProtStabCNN" active={stats.cnnUsed}   color="violet" />
                  <StatusChip label="DMS data"  active={stats.nDmsVariants > 0} color="green" />
                </>
              )}
            </div>
          </div>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Offline banner ── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-800 text-sm">ML service unavailable</div>
            <div className="text-red-600 text-sm mt-0.5">{error}</div>
            <div className="text-red-500 text-xs mt-1.5">
              Start with:{' '}
              <code className="bg-red-100 px-1 py-0.5 rounded font-mono">
                cd ml-service &amp;&amp; python -m uvicorn main:app --port 8000 --reload
              </code>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <>
          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KPICard label="Training variants" value={stats.nVariants}
              sub={`${stats.nProteins} proteins · ${stats.nFeatures} features`} accent="blue" />
            <KPICard label="Random-CV R²"
              value={fmt(stats.randomCvR2, 3)}
              sub={`RMSE ${fmt(stats.randomCvRMSE, 3)} kcal/mol`} accent="green" />
            <KPICard label="Protein-CV R²"
              value={fmt(stats.proteinCvR2, 3)}
              sub={`RMSE ${fmt(stats.proteinCvRMSE, 3)} kcal/mol`} accent="amber" />
            <KPICard label="In-sample R²"
              value={fmt(stats.inSampleR2, 3)}
              sub={`Pearson r ${fmt(stats.pearsonR, 3)}`} accent="violet" />
          </div>

          {/* ── Main 2-col layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Left — Charts (3/5) */}
            <div className="lg:col-span-3 space-y-5">

              {/* Algorithm comparison */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Algorithm Comparison</h3>
                  <span className="ml-auto text-xs text-gray-400 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                    protein-CV = honest metric
                  </span>
                </div>
                <AlgorithmComparisonChart
                  cvResults={stats.cvResults}
                  proteinCvResults={stats.proteinCvResults}
                />
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  <strong>Protein-held-out R²</strong> is the honest metric — entire protein families are
                  withheld from training, mimicking real deployment on novel proteins.
                  Random-CV R² (within-protein) is inflated by same-protein leakage.
                </p>
              </div>

              {/* Per-protein table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FlaskConical className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Per-Protein Breakdown</h3>
                  <span className="ml-auto text-xs text-gray-500">{stats.nProteins} proteins · ΔΔG in kcal/mol</span>
                </div>
                <ProteinStatsTable proteinStats={stats.proteinStats} />
              </div>

            </div>

            {/* Right — Roadmap + extremes (2/5) */}
            <div className="lg:col-span-2 space-y-5">

              {/* Phase roadmap */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-violet-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">Phase D Roadmap</h3>
                </div>
                <PhaseRoadmap stats={stats} />
              </div>

              {/* Advanced retrain */}
              {isAdmin && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu className="w-4 h-4 text-gray-400" />
                    <h3 className="font-semibold text-gray-900 text-sm">Advanced Retrain</h3>
                  </div>

                  <div className="space-y-2 mb-4">
                    {[
                      { key: 'useCnn',     label: 'Include ProtStabCNN', desc: 'MLP over 25-residue window (~2 min extra)' },
                      { key: 'augmentDms', label: 'Augment with DMS data', desc: 'Add client-data/dms/ CSV files to training' },
                    ].map(({ key, label, desc }) => (
                      <label key={key} className="flex items-start gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-violet-600"
                          checked={retrainOpts[key]}
                          onChange={e => setRetrainOpts(o => ({ ...o, [key]: e.target.checked }))}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</div>
                          <div className="text-xs text-gray-400">{desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <button
                    onClick={handleAdvancedRetrain}
                    disabled={retraining}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      retraining
                        ? 'bg-violet-100 text-violet-400 cursor-not-allowed'
                        : 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'
                    }`}
                  >
                    {retraining
                      ? <><RefreshCw className="w-4 h-4 animate-spin" />Training…</>
                      : <><RefreshCw className="w-4 h-4" />Retrain Model</>}
                  </button>

                  {retrainResult && (
                    <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      {retrainResult.algorithm} · R² {fmt(retrainResult.looR2, 3)} · {retrainResult.nVariants} variants
                      {retrainResult.cnnTrained && ' · CNN trained'}
                    </div>
                  )}
                  {retrainError && (
                    <div className="mt-3 flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {retrainError}
                    </div>
                  )}
                </div>
              )}

              {/* Top mutations */}
              {stats.topStabilising?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <h3 className="font-semibold text-gray-900 text-sm">Top Stabilising</h3>
                  </div>
                  <div className="space-y-1.5">
                    {stats.topStabilising.map((m, i) => (
                      <MutationCard key={i} mutation={m} rank={i + 1} type="stabilising" />
                    ))}
                  </div>
                </div>
              )}

              {stats.topDestabilising?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <h3 className="font-semibold text-gray-900 text-sm">Most Destabilising</h3>
                  </div>
                  <div className="space-y-1.5">
                    {[...stats.topDestabilising].reverse().map((m, i) => (
                      <MutationCard key={i} mutation={m} rank={i + 1} type="destabilising" />
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── Interpretation guide ── */}
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-violet-600" />
              <h3 className="font-semibold text-violet-900 text-sm">Phase D upgrade path</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-violet-800 leading-relaxed">
              <div>
                <div className="font-semibold mb-1">Step 10 — ProtStabCNN</div>
                Trigger Advanced Retrain with "Include ProtStabCNN" checked. Adds a 3-layer MLP
                (256→128→64) trained on 25-residue sequence windows. Compared against RF/GB/Ridge
                using protein-held-out CV; best model is deployed automatically.
              </div>
              <div>
                <div className="font-semibold mb-1">Step 11 — DMS Augmentation</div>
                Place DMS v7 CSV files in <code className="bg-violet-100 px-1 rounded">client-data/dms/</code> with
                columns: protein, mutation, sequence, ddg. Then retrain with "Augment with DMS data" checked
                to combine S1724 + DMS training sets.
              </div>
              <div>
                <div className="font-semibold mb-1">Step 12 — ESM2-35M</div>
                Already configured as default ESM model (facebook/esm2_t12_35M_UR50D, 35M params).
                Install torch + transformers and retrain — the 35M model provides better
                cross-protein marginal scores than the previous 8M version.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
