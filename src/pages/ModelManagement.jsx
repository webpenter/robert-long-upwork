import { useState, useEffect, useCallback } from 'react';
import {
  Brain, RefreshCw, AlertCircle, Cpu, Activity, Database,
  BarChart2, Layers, Thermometer, FileWarning, CheckCircle2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import api from '../services/apiClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v, digits = 3) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(digits);
}

function fmtInt(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = 'blue' }) {
  const colors = {
    blue:   'from-blue-500/10 to-blue-500/5 border-blue-200 text-blue-700',
    green:  'from-green-500/10 to-green-500/5 border-green-200 text-green-700',
    amber:  'from-amber-500/10 to-amber-500/5 border-amber-200 text-amber-700',
    violet: 'from-violet-500/10 to-violet-500/5 border-violet-200 text-violet-700',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} border rounded-xl p-4 flex flex-col gap-1`}>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</span>
      <span className="font-bold leading-none text-2xl tabular-nums">{value}</span>
      {sub && <span className="text-xs opacity-60 mt-0.5">{sub}</span>}
    </div>
  );
}

function Gauge({ label, value, max = 1, color = '#3b82f6', hint }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="font-mono font-semibold text-gray-900 tabular-nums">{fmt(value, 3)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function StatusDot({ online }) {
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
      {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online ? 'bg-green-500' : 'bg-red-400'}`} />
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ModelManagement() {
  const [info,    setInfo]    = useState(null);
  const [stats,   setStats]   = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // /model/info describes the loaded checkpoint; /dataset-stats adds the
      // training corpus, when the checkpoint recorded one.
      const [i, s] = await Promise.all([
        api.get('/ml/info'),
        api.get('/ml/dataset-stats').catch(() => null),
      ]);
      setInfo(i);
      setStats(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        <div className="h-10 w-64 bg-gray-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const vm = info?.val_metrics ?? {};
  const online = !error && !!info;
  const experimental = (info?.phase || '').includes('EXPERIMENTAL');

  // Validation metrics as reported by the loaded checkpoint. Correlations are on a
  // 0–1 scale; errors are in kcal/mol and get their own axis below.
  const corrData = [
    { name: 'Pearson r',   value: vm.pearson_r    != null ? +Number(vm.pearson_r).toFixed(3)    : null, fill: '#3b82f6' },
    { name: 'Spearman ρ',  value: vm.spearman_rho != null ? +Number(vm.spearman_rho).toFixed(3) : null, fill: '#8b5cf6' },
    { name: 'Accuracy',    value: vm.accuracy     != null ? +Number(vm.accuracy).toFixed(3)     : null, fill: '#10b981' },
  ].filter(d => d.value != null);

  const hasCorpus = stats && (stats.nTrainingSeqs != null || stats.trainingData != null);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Model Management</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <StatusDot online={online} />
              <span className="text-xs text-gray-500">{online ? 'ML service online' : 'ML service offline'}</span>
              {info?.name && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs font-mono text-gray-400">{info.name}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Offline ── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-800 text-sm">ML service unavailable</div>
            <div className="text-red-600 text-sm mt-0.5">{error}</div>
            <div className="text-red-500 text-xs mt-1.5">
              Start the whole stack with <code className="bg-red-100 px-1 py-0.5 rounded font-mono">npm run dev</code>,
              or the ML service alone with <code className="bg-red-100 px-1 py-0.5 rounded font-mono">npm run dev:ml</code>.
              The model takes ~20 s to load on first boot.
            </div>
          </div>
        </div>
      )}

      {/* ── Experimental banner ── */}
      {experimental && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <FileWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <div className="font-medium">Experimental checkpoint</div>
            <p className="text-amber-700 mt-0.5 text-xs leading-relaxed">{info.phase}</p>
          </div>
        </div>
      )}

      {info && (
        <>
          {/* ── Validation metrics, straight from the checkpoint ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="MAE"       value={fmt(vm.mae, 3)}        sub="kcal/mol · lower is better" accent="green" />
            <MetricCard label="RMSE"      value={fmt(vm.rmse, 3)}       sub="kcal/mol · lower is better" accent="amber" />
            <MetricCard label="Pearson r" value={fmt(vm.pearson_r, 3)}  sub="linear correlation"          accent="blue" />
            <MetricCard label="Spearman ρ" value={fmt(vm.spearman_rho, 3)} sub="rank correlation"         accent="violet" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left column */}
            <div className="lg:col-span-2 space-y-5">

              {/* Correlation chart */}
              {corrData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart2 className="w-4 h-4 text-gray-400" />
                    <h3 className="font-semibold text-gray-900 text-sm">Validation Correlation</h3>
                    <span className="ml-auto text-xs text-gray-400">perfect = 1.0</span>
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={corrData} layout="vertical" margin={{ left: 80, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11 }} tickCount={6} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip formatter={(v) => [Number(v).toFixed(4), 'Value']}
                        contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }} />
                      <ReferenceLine x={1} stroke="#94a3b8" strokeDasharray="4 2" />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {corrData.map((e) => <Cell key={e.name} fill={e.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    Measured on the checkpoint's held-out validation split. <strong>Pearson</strong> tracks how close
                    predicted ΔG is to measured ΔG; <strong>Spearman</strong> tracks whether variants are put in the
                    right order, which is what matters when ranking candidates against each other.
                  </p>
                </div>
              )}

              {/* Error gauges */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Prediction Error</h3>
                </div>
                <Gauge label="MAE (kcal/mol)"  value={vm.mae}  max={3} color="#10b981"
                  hint="Mean absolute error against measured ΔG. Shown against a 0–3 kcal/mol scale." />
                <Gauge label="RMSE (kcal/mol)" value={vm.rmse} max={3} color="#f59e0b"
                  hint="Penalises large misses more heavily than MAE." />
                <p className="text-xs text-gray-500 border-t border-gray-50 pt-3 leading-relaxed">
                  A single point mutation typically shifts ΔG by well under 1 kcal/mol, which is inside this
                  error bar. Treat the model as a tool for ranking whole sequences, not for resolving the
                  effect of one residue.
                </p>
              </div>

              {/* Architecture */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Architecture</h3>
                </div>
                <p className="text-sm text-gray-700 font-mono leading-relaxed bg-gray-50 rounded-lg p-3 break-words">
                  {info.architecture}
                </p>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-sm">
                  {[
                    { dt: 'Input',  dd: info.input },
                    { dt: 'Output', dd: info.output },
                    { dt: 'Residue cap', dd: info.max_len != null ? `${info.max_len} aa` : '—' },
                  ].map(({ dt, dd }) => dd && (
                    <div key={dt} className="bg-gray-50 rounded-lg px-3 py-2">
                      <div className="text-xs font-medium text-gray-500">{dt}</div>
                      <div className="text-xs text-gray-700 mt-0.5 leading-snug">{dd}</div>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">

              {/* Checkpoint metadata */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Checkpoint</h3>
                </div>
                <dl className="space-y-2.5 text-sm">
                  {[
                    { dt: 'Name',       dd: info.name },
                    { dt: 'Type',       dd: info.model_type },
                    { dt: 'Parameters', dd: fmtInt(info.parameters) },
                    { dt: 'Epoch',      dd: info.epoch ?? '—' },
                    { dt: 'Conditions', dd: info.usesConditions ? 'temperature + pH' : 'not used' },
                    { dt: 'Accuracy',   dd: vm.accuracy != null ? fmt(vm.accuracy, 4) : '—' },
                  ].map(({ dt, dd }) => (
                    <div key={dt} className="flex justify-between gap-2">
                      <dt className="text-gray-500">{dt}</dt>
                      <dd className="font-mono text-gray-800 text-right truncate max-w-[140px]" title={String(dd)}>{dd}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Conditions caveat */}
              {info.usesConditions && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Thermometer className="w-4 h-4 text-amber-600" />
                    <h3 className="font-semibold text-amber-900 text-sm">Condition sensitivity</h3>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    This checkpoint accepts temperature and pH, but its gate saturates on raw units: across
                    25–95 °C the prediction moves under 0.03 kcal/mol. Until the training-time normalisation
                    is confirmed with the model author, treat condition inputs as recorded metadata rather
                    than as something that meaningfully changes the answer.
                  </p>
                </div>
              )}

              {/* Training corpus */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Training Data</h3>
                </div>
                {hasCorpus ? (
                  <dl className="space-y-2.5 text-sm">
                    {stats.nTrainingSeqs != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">Sequences</dt>
                        <dd className="font-mono text-gray-800">{fmtInt(stats.nTrainingSeqs)}</dd>
                      </div>
                    )}
                    {stats.splits && Object.entries(stats.splits).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-gray-500 capitalize">{k}</dt>
                        <dd className="font-mono text-gray-800">{fmtInt(v)}</dd>
                      </div>
                    ))}
                    {stats.trainingData && <p className="text-xs text-gray-500 pt-2 border-t border-gray-50 leading-relaxed">{stats.trainingData}</p>}
                  </dl>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Not recorded for this checkpoint.</p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Training provenance cannot be recovered from the weights. Add a{' '}
                      <code className="bg-gray-100 px-1 rounded font-mono">training_meta</code> block to the
                      checkpoint or fill in{' '}
                      <code className="bg-gray-100 px-1 rounded font-mono">models/best_model.pt.meta.json</code>{' '}
                      and it will appear here. See <code className="bg-gray-100 px-1 rounded font-mono">ml-service/models/README.md</code>.
                    </p>
                  </div>
                )}
                {stats?.trainingMetaSource && (
                  <p className="text-xs text-gray-300 mt-3 font-mono">source: {stats.trainingMetaSource}</p>
                )}
              </div>

              {/* Swapping checkpoints */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-sm">Swapping the model</h3>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  The service detects the architecture from the checkpoint, so replacing{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono">ml-service/models/best_model.pt</code>{' '}
                  is enough — no code change. To try another checkpoint without touching the default, set{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono">ML_CHECKPOINT_PATH</code> and restart{' '}
                  <code className="bg-gray-100 px-1 rounded font-mono">npm run dev:ml</code>.
                </p>
                {stats?.checkpointPath && (
                  <p className="text-xs text-gray-400 mt-2.5 font-mono break-all">{stats.checkpointPath}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
