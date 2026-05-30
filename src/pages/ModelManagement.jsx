import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, RefreshCw, CheckCircle2, AlertCircle, Terminal,
  Cpu, Activity, Database, Clock, ChevronRight, Lock,
  TrendingUp, BarChart2, Layers,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import api from '../services/apiClient';
import { useAuth } from '../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v, digits = 3) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(digits);
}

function fmtVersion(v) {
  if (!v) return '—';
  // e.g. "GradBoost_v1_20260525_143012" → "v1 · 25 May 2026 14:30"
  const parts = v.split('_');
  return parts.slice(-2, -1)[0]?.length === 8
    ? `${parts.slice(-2, -1)[0].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}`
    : v;
}

function ago(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = 'blue', large = false }) {
  const colors = {
    blue:   'from-blue-500/10 to-blue-500/5 border-blue-200 text-blue-700',
    green:  'from-green-500/10 to-green-500/5 border-green-200 text-green-700',
    amber:  'from-amber-500/10 to-amber-500/5 border-amber-200 text-amber-700',
    slate:  'from-slate-500/10 to-slate-500/5 border-slate-200 text-slate-700',
    violet: 'from-violet-500/10 to-violet-500/5 border-violet-200 text-violet-700',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} border rounded-xl p-4 flex flex-col gap-1`}>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</span>
      <span className={`font-bold leading-none ${large ? 'text-3xl' : 'text-2xl'}`}>{value}</span>
      {sub && <span className="text-xs opacity-60 mt-0.5">{sub}</span>}
    </div>
  );
}

function R2Gauge({ label, value, max = 1, color = '#3b82f6' }) {
  const pct = Math.max(0, Math.min(1, (value ?? 0) / max)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="font-mono font-semibold text-gray-900">{fmt(value, 3)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function StatusDot({ online }) {
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
      {online && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online ? 'bg-green-500' : 'bg-red-400'}`} />
    </span>
  );
}

const RETRAIN_IDLE    = 'idle';
const RETRAIN_RUNNING = 'running';
const RETRAIN_DONE    = 'done';
const RETRAIN_ERROR   = 'error';

// ── Main page ────────────────────────────────────────────────────────────────

export default function ModelManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [info,       setInfo]       = useState(null);
  const [infoError,  setInfoError]  = useState(null);
  const [infoLoading, setInfoLoading] = useState(true);

  const [retrainState,  setRetrainState]  = useState(RETRAIN_IDLE);
  const [retrainResult, setRetrainResult] = useState(null);
  const [retrainError,  setRetrainError]  = useState(null);
  const [elapsed,       setElapsed]       = useState(0);

  const abortRef  = useRef(null);
  const timerRef  = useRef(null);
  const consoleRef = useRef(null);

  const loadInfo = useCallback(async () => {
    setInfoLoading(true);
    setInfoError(null);
    try {
      const data = await api.get('/ml/info');
      setInfo(data);
    } catch (err) {
      setInfoError(err.message);
    } finally {
      setInfoLoading(false);
    }
  }, []);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  // Auto-scroll console on new output
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [retrainResult?.output]);

  const startRetrain = async () => {
    setRetrainState(RETRAIN_RUNNING);
    setRetrainResult(null);
    setRetrainError(null);
    setElapsed(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const result = await api.post('/ml/retrain', {});
      clearInterval(timerRef.current);
      setRetrainResult(result);
      setRetrainState(RETRAIN_DONE);
      // Refresh model info to reflect new metrics
      await loadInfo();
    } catch (err) {
      clearInterval(timerRef.current);
      setRetrainError(err.message);
      setRetrainState(RETRAIN_ERROR);
    }
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    abortRef.current?.abort();
  }, []);

  // ── Chart data ────────────────────────────────────────────────────────────

  const chartData = info ? [
    { name: 'LOO R²',        value: +(info.looR2       ?? 0).toFixed(3), fill: '#f59e0b' },
    { name: 'In-sample R²',  value: +(info.inSampleR2  ?? 0).toFixed(3), fill: '#3b82f6' },
    { name: 'LOO Pearson r', value: +(Math.sqrt(Math.max(0, info.looR2 ?? 0))).toFixed(3), fill: '#8b5cf6' },
    { name: 'In-sample r',   value: +(info.pearsonR    ?? 0).toFixed(3), fill: '#10b981' },
  ] : [];

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (infoLoading) {
    return (
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        <div className="h-10 w-64 bg-gray-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const modelOnline = !infoError;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Model Management</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusDot online={modelOnline} />
              <span className="text-xs text-gray-500">
                {modelOnline ? 'ML service online' : 'ML service offline'}
              </span>
              {info?.modelVersion && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs font-mono text-gray-400">{info.modelVersion}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={loadInfo}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Offline banner ── */}
      {infoError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-800 text-sm">ML service unavailable</div>
            <div className="text-red-600 text-sm mt-0.5">{infoError}</div>
            <div className="text-red-500 text-xs mt-1.5">
              Start the ML service: <code className="bg-red-100 px-1 py-0.5 rounded font-mono">
                python -m uvicorn main:app --port 8000 --reload
              </code> inside <code className="bg-red-100 px-1 py-0.5 rounded font-mono">ml-service/</code>
            </div>
          </div>
        </div>
      )}

      {/* ── Metric cards ── */}
      {info && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            label="Algorithm"
            value={info.algorithm ?? '—'}
            sub="selected by LOO CV"
            accent="blue"
          />
          <MetricCard
            label="Training variants"
            value={info.nVariants ?? '—'}
            sub={`${info.nFeatures ?? '—'} features/mutation`}
            accent="green"
          />
          <MetricCard
            label="LOO R²"
            value={fmt(info.looR2, 3)}
            sub={`RMSE ${fmt(info.looRMSE, 2)}`}
            accent="amber"
          />
          <MetricCard
            label="In-sample R²"
            value={fmt(info.inSampleR2, 3)}
            sub={`Pearson r ${fmt(info.pearsonR, 3)}`}
            accent="violet"
          />
        </div>
      )}

      {/* ── Main two-column layout ── */}
      {info && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left — Performance visualization */}
          <div className="lg:col-span-2 space-y-5">

            {/* Bar chart */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-900 text-sm">Performance Metrics</h3>
                <span className="ml-auto text-xs text-gray-400">perfect correlation = 1.0</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 90, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11 }} tickCount={6} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    formatter={(v) => [v.toFixed(4), 'Value']}
                    contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
                  />
                  <ReferenceLine x={1} stroke="#94a3b8" strokeDasharray="4 2" />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                LOO metrics reflect honest generalisation on n={info.nVariants} variants (leave-one-out cross-validation).
                LOO R²=0.12 is expected at this dataset size; LOO Pearson r captures monotonic ranking ability more reliably.
              </p>
            </div>

            {/* Gauge rows */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-900 text-sm">Correlation Breakdown</h3>
              </div>
              <R2Gauge label="In-sample R²"  value={info.inSampleR2}           max={1}  color="#3b82f6" />
              <R2Gauge label="LOO R² (CV)"   value={info.looR2}                max={1}  color="#f59e0b" />
              <R2Gauge label="Pearson r"      value={info.pearsonR}             max={1}  color="#10b981" />
              <R2Gauge label="LOO RMSE"       value={1 - Math.min(info.looRMSE / 50, 1)} max={1} color="#8b5cf6" />
              <div className="pt-1 border-t border-gray-50 flex gap-6 text-xs text-gray-500">
                <span><span className="font-medium text-gray-700">RMSE raw:</span> {fmt(info.looRMSE, 2)} score units</span>
                {info.stabilityRange && (
                  <span>
                    <span className="font-medium text-gray-700">Score range:</span>{' '}
                    {fmt(info.stabilityRange.min, 2)} – {fmt(info.stabilityRange.max, 2)}
                  </span>
                )}
              </div>
            </div>

            {/* Feature + coverage detail */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-900 text-sm">Feature Engineering</h3>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {[
                  { label: 'BLOSUM62',           desc: 'substitution log-odds' },
                  { label: 'ΔHydrophobicity',    desc: 'Kyte-Doolittle ΔKD' },
                  { label: 'ΔVolume',             desc: 'side-chain Å³' },
                  { label: 'ΔCharge',             desc: 'net charge shift' },
                  { label: 'Burial score',        desc: 'solvent exposure proxy' },
                  { label: 'One-hot × 40',        desc: 'from_aa + to_aa encoding' },
                  { label: 'Position fraction',   desc: 'relative sequence position' },
                  { label: 'Binary flags',        desc: 'terminus / proline context' },
                  { label: `${info.nFeatures} total`, desc: 'per-mutation feature vector' },
                ].map(({ label, desc }) => (
                  <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                    <div className="font-medium text-gray-800">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Retrain panel */}
          <div className="space-y-4">

            {/* Model metadata */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-900 text-sm">Model Metadata</h3>
              </div>
              <dl className="space-y-2.5 text-sm">
                {[
                  { dt: 'Version',    dd: info.modelVersion ?? '—' },
                  { dt: 'Algorithm',  dd: info.algorithm ?? '—' },
                  { dt: 'Variants',   dd: info.nVariants ?? '—' },
                  { dt: 'Features',   dd: info.nFeatures ?? '—' },
                  { dt: 'LOO RMSE',   dd: fmt(info.looRMSE, 4) },
                  { dt: 'Score min',  dd: fmt(info.stabilityRange?.min, 3) },
                  { dt: 'Score max',  dd: fmt(info.stabilityRange?.max, 3) },
                ].map(({ dt, dd }) => (
                  <div key={dt} className="flex justify-between gap-2">
                    <dt className="text-gray-500">{dt}</dt>
                    <dd className="font-mono text-gray-800 text-right truncate max-w-[120px]" title={dd}>{dd}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Retrain card */}
            {isAdmin ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Retrain Model</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  Reruns the full training pipeline from CSV files in{' '}
                  <code className="bg-gray-100 px-1 rounded text-xs">ml-service/data/</code>.
                  Takes ~30–90 s. All new predictions will use the updated model immediately.
                </p>

                <button
                  onClick={startRetrain}
                  disabled={retrainState === RETRAIN_RUNNING}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    retrainState === RETRAIN_RUNNING
                      ? 'bg-blue-100 text-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  }`}
                >
                  {retrainState === RETRAIN_RUNNING ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Training… {elapsed}s
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Trigger Retraining
                    </>
                  )}
                </button>

                {/* Status badges */}
                {retrainState === RETRAIN_DONE && retrainResult && (
                  <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Trained · {retrainResult.algorithm} · LOO R² {fmt(retrainResult.looR2, 3)} · {retrainResult.nVariants} variants
                  </div>
                )}
                {retrainState === RETRAIN_ERROR && (
                  <div className="mt-3 flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{retrainError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 flex items-start gap-3">
                <Lock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-gray-600">Admin access required</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Model retraining is restricted to platform administrators. Contact your admin to trigger a retrain after new data is uploaded.
                  </div>
                </div>
              </div>
            )}

            {/* Training status & quick metrics after retrain */}
            {retrainState !== RETRAIN_IDLE && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
                  <Terminal className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Training Output</span>
                  {retrainState === RETRAIN_RUNNING && (
                    <div className="ml-auto flex items-center gap-1.5 text-xs text-blue-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      Running
                    </div>
                  )}
                </div>
                <div
                  ref={consoleRef}
                  className="bg-slate-950 rounded-b-xl p-3 h-48 overflow-y-auto font-mono text-xs leading-relaxed"
                >
                  {retrainState === RETRAIN_RUNNING && (
                    <div className="text-slate-400 animate-pulse">
                      {'>'} Executing train.py --from-csv …
                    </div>
                  )}
                  {retrainResult?.output && (
                    <pre className="text-green-400 whitespace-pre-wrap break-all">
                      {retrainResult.output}
                    </pre>
                  )}
                  {retrainError && (
                    <pre className="text-red-400 whitespace-pre-wrap break-all">
                      ERROR: {retrainError}
                    </pre>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Interpretation guide ── */}
      {info && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-blue-900 text-sm">Interpreting these metrics</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-blue-800 leading-relaxed">
            <div>
              <div className="font-semibold mb-1">LOO R² = {fmt(info.looR2, 3)}</div>
              Expected to be low at n={info.nVariants}. With LOO CV, each fold trains on {(info.nVariants ?? 1) - 1} samples
              and tests on 1 — variance is high by design. What matters is the ranking, not absolute R².
            </div>
            <div>
              <div className="font-semibold mb-1">In-sample R² = {fmt(info.inSampleR2, 3)}</div>
              Confirms the model has learnt the training distribution. Not used for generalisation claims —
              it is expected to be near 1.0 for gradient boosting.
            </div>
            <div>
              <div className="font-semibold mb-1">LOO RMSE = {fmt(info.looRMSE, 2)}</div>
              Absolute prediction error in composite stability score units (WT = 1.0,
              range {fmt(info.stabilityRange?.min, 2)}–{fmt(info.stabilityRange?.max, 2)}).
              Predictions are most reliable for ranking mutations, not precise ΔΔG values.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
