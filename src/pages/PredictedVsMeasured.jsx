import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Target, Loader2, AlertTriangle, Layers, Download, Info, TrendingDown, FlaskConical,
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import api from '../services/apiClient';
import { ModelBadge } from '../components/PredictionFlags';

const METRICS = [
  { key: 'apparent_tm', label: 'Apparent Tm' },
  { key: 'half_life',   label: 'Half-life' },
  { key: 'fold_change', label: 'Fold vs WT' },
  { key: 'rate_constant', label: 'Rate constant' },
];

/**
 * Turns a correlation into a sentence a bench scientist can act on.
 *
 * Two things this has to get right. A NEGATIVE value here is not "a bit worse" —
 * both sides are already in stability orientation, so a negative number means the
 * model ordered the variants backwards, which is far more likely to be a
 * labelling mistake than a real anti-correlation and should be said out loud.
 * And a strong correlation over very few variants is not yet evidence, so the
 * p-value governs the verdict rather than decorating it.
 */
function verdict(rho, p, n) {
  if (rho == null) {
    return { tone: 'neutral', headline: 'Not enough paired variants yet',
      detail: `Three or more variants need both a prediction and a measurement. Currently ${n}.` };
  }
  const mag = Math.abs(rho);
  const strength = mag >= 0.8 ? 'strongly' : mag >= 0.5 ? 'moderately' : mag >= 0.3 ? 'weakly' : 'barely';
  const significant = p != null && p < 0.05;

  if (rho < -0.3) {
    return {
      tone: 'bad',
      headline: 'The model ranked these in the wrong order',
      detail: `The predicted ordering is ${strength} inverted against the bench result. Before treating this as a model failure, check that the measured metric points the way the platform assumes (higher = more stable) and that the right variants are linked to the right predictions — an inverted axis has caused exactly this reading before.`,
    };
  }
  if (!significant) {
    return {
      tone: 'warn',
      headline: mag >= 0.5 ? 'Encouraging, but not yet evidence' : 'No reliable relationship yet',
      detail: `With ${n} variants, a correlation this size would come up by chance about ${p == null ? 'often' : `${Math.round(p * 100)}% of the time`}. More variants on one scaffold is the fastest way to settle it.`,
    };
  }
  return {
    tone: mag >= 0.5 ? 'good' : 'warn',
    headline: `The model ordered these ${strength} correctly`,
    detail: `Unlikely to be chance (p = ${p.toFixed(3)} over ${n} variants). This is rank agreement only — see the note on absolute values below.`,
  };
}

const TONE = {
  good:    { box: 'bg-green-50 border-green-200',   text: 'text-green-800',  sub: 'text-green-700'  },
  warn:    { box: 'bg-amber-50 border-amber-200',   text: 'text-amber-800',  sub: 'text-amber-700'  },
  bad:     { box: 'bg-red-50 border-red-200',       text: 'text-red-800',    sub: 'text-red-700'    },
  neutral: { box: 'bg-gray-50 border-gray-200',     text: 'text-gray-800',   sub: 'text-gray-600'   },
};

function StatCard({ label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 font-mono">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function PredictedVsMeasured() {
  const [projects, setProjects]     = useState([]);
  const [projectId, setProjectId]   = useState('');
  const [experiments, setExperiments] = useState([]);
  const [experimentId, setExperimentId] = useState('');
  const [metric, setMetric]         = useState('apparent_tm');
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  // Guards the one-time fallback to a metric that has data, so a deliberate
  // later choice of an empty metric is respected instead of being overridden.
  const autoPicked = useRef(false);

  useEffect(() => {
    api.get('/projects')
      .then(({ projects: p }) => {
        setProjects(p || []);
        if (p?.length) setProjectId(p[0]._id);
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/experiments?projectId=${projectId}`)
      .then(({ experiments: e }) => setExperiments(e || []))
      .catch(() => setExperiments([]));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    // `cancelled` guards against an earlier, slower request landing after a
    // later one — switching metric twice quickly would otherwise leave the
    // chart showing results for a metric the controls no longer say.
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ projectId, metric });
        if (experimentId) qs.set('experimentId', experimentId);
        const result = await api.get(`/analytics/predicted-vs-measured?${qs}`);
        if (cancelled) return;

        // An assay records one or two metrics, not all of them. If the selected
        // metric was never measured here, switch once to whichever one actually
        // has data rather than showing an empty page that reads like a fault.
        const best = result.availableMetrics?.[0];
        if (!autoPicked.current && result.coverage.variantsWithMeasurements === 0 && best) {
          autoPicked.current = true;
          setMetric(best.type); // re-triggers this effect with the new metric
          return;
        }
        setData(result);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, experimentId, metric]);

  const rows = useMemo(() => data?.rows || [], [data]);

  // Prefer the metrics the backend says exist here, but never drop the current
  // selection off the list — a select whose value has no option renders blank.
  const metricOptions = useMemo(() => {
    const avail = data?.availableMetrics?.length
      ? data.availableMetrics
      : METRICS.map(m => ({ type: m.key, label: m.label, nVariants: null }));
    if (avail.some(o => o.type === metric)) return avail;
    const known = METRICS.find(m => m.key === metric);
    return [...avail, { type: metric, label: known?.label || metric, nVariants: 0 }];
  }, [data, metric]);
  const v = data ? verdict(data.spearman, data.spearmanP, data.n) : null;
  const tone = TONE[v?.tone || 'neutral'];

  // Two points are enough to draw the fitted line across the plotted x-range.
  const trend = useMemo(() => {
    if (!data?.fit || rows.length < 2) return [];
    const xs = rows.map(r => r.predictedDg);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    return [lo, hi].map(x => ({ predictedDg: x, measured: data.fit.slope * x + data.fit.intercept }));
  }, [data, rows]);

  function exportCsv() {
    const header = 'predicted_rank,measured_rank,rank_error,name,mutations,predicted_dG_kcal_mol,measured,measured_sd,unit,n_replicates,model_version,in_distribution';
    const body = rows.map(r => [
      r.predictedRank, r.measuredRank, r.rankError,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${(r.mutations || []).join(' ')}"`,
      r.predictedDg, r.measured, r.measuredSd ?? '', r.unit, r.nReplicates,
      r.modelVersion || '', r.inDistribution,
    ].join(','));
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predicted-vs-measured-${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const mixedModels = (data?.modelVersions?.length || 0) > 1;
  const anyExtrapolated = rows.some(r => !r.inDistribution);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-600" />
            Predicted vs. Measured
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            How well the model&rsquo;s predicted ordering matched what the bench actually measured.
          </p>
        </div>
        {rows.length > 0 && (
          <button onClick={exportCsv}
            className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4">
        <label className="flex-1 min-w-[180px]">
          <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Project</span>
          <select value={projectId}
            onChange={e => { setProjectId(e.target.value); setExperimentId(''); }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[180px]">
          <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Experiment</span>
          <select value={experimentId} onChange={e => setExperimentId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All experiments in project</option>
            {experiments.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[180px]">
          <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Measured metric</span>
          <select value={metric} onChange={e => setMetric(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {metricOptions.map(m => (
              <option key={m.type} value={m.type}>
                {m.label}{m.nVariants != null ? ` — ${m.nVariants} variant${m.nVariants === 1 ? '' : 's'}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Pairing predictions with measurements...
        </div>
      ) : !data ? null : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <FlaskConical className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Nothing to compare yet</p>
          <p className="text-gray-400 text-sm mt-1 max-w-md mx-auto">
            {data.coverage.variantsWithMeasurements === 0
              ? `No variant in this scope has a usable ${data.metric.label} measurement yet.`
              : `${data.coverage.variantsWithMeasurements} variant(s) have measurements, but none of them has a completed prediction linked to it. Run predictions against those variants to populate this view.`}
          </p>
        </div>
      ) : (
        <>
          {/* Verdict */}
          <div className={`border rounded-xl p-5 ${tone.box}`}>
            <p className={`text-base font-semibold ${tone.text}`}>{v.headline}</p>
            <p className={`text-sm mt-1 ${tone.sub}`}>{v.detail}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Spearman ρ" value={data.spearman?.toFixed(3) ?? '—'}
              hint="+1 = ranked perfectly" />
            <StatCard label="p-value" value={data.spearmanP?.toFixed(3) ?? '—'}
              hint="permutation test" />
            <StatCard label="Variants paired" value={data.n}
              hint={`${data.coverage.variantsWithMeasurements} measured / ${data.coverage.variantsWithPredictions} predicted`} />
            <StatCard label="Pearson r" value={data.pearson?.toFixed(3) ?? '—'}
              hint="linear, not rank" />
          </div>

          {/* Caveats */}
          {mixedModels && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
              <Layers className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-orange-800">
                  These predictions come from {data.modelVersions.length} different models
                </p>
                <p className="text-sm text-orange-700">
                  Their ΔG values are not on a common scale, so a single correlation across
                  them understates whichever model is actually better. Re-run them all with the
                  current model before reading much into this number.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {data.modelVersions.map(m => <ModelBadge key={m} modelVersion={m} />)}
                </div>
              </div>
            </div>
          )}

          {data.coverage.excludedPoorFit > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed">
                {data.coverage.excludedPoorFit} measurement(s) were left out because the curve fit
                failed the R² gate. A well whose signal never changes fits with a near-zero rate
                constant and produces an enormous, meaningless value that would otherwise dominate
                this correlation on its own.
              </p>
            </div>
          )}

          {/* Scatter */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Predicted ΔG vs. measured {data.metric.label}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  A model that ranks correctly slopes <strong>downward</strong> here — more negative
                  ΔG means more stable, while a higher {data.metric.label.toLowerCase()} also means more stable.
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 45, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="predictedDg" name="Predicted ΔG"
                  tick={{ fontSize: 11 }} domain={['auto', 'auto']}
                  label={{ value: '← more stable    Predicted ΔG (kcal/mol)    less stable →',
                    position: 'insideBottom', offset: -25, style: { fontSize: 11, fill: '#64748b' } }} />
                <YAxis type="number" dataKey="measured" name={data.metric.label}
                  tick={{ fontSize: 11 }} domain={['auto', 'auto']}
                  label={{ value: `${data.metric.label} (${data.metric.unit})`, angle: -90,
                    position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }} />
                <ZAxis range={[70, 70]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0].payload;
                    if (r.name === undefined) return null; // trend line point
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs">
                        <p className="font-semibold text-gray-900">{r.name}</p>
                        {r.mutations?.length > 0 && (
                          <p className="text-gray-500 font-mono">{r.mutations.join(', ')}</p>
                        )}
                        <p className="mt-1 text-gray-700">Predicted ΔG: <span className="font-mono">{r.predictedDg?.toFixed(2)}</span></p>
                        <p className="text-gray-700">
                          Measured: <span className="font-mono">{r.measured}</span> {r.unit}
                          {r.measuredSd != null && <span className="text-gray-400"> ± {r.measuredSd}</span>}
                        </p>
                        <p className="text-gray-500 mt-1">
                          rank {r.predictedRank} predicted → {r.measuredRank} measured
                        </p>
                      </div>
                    );
                  }}
                />
                {trend.length === 2 && (
                  <Scatter data={trend} line={{ stroke: '#cbd5e1', strokeWidth: 2 }}
                    shape={() => null} legendType="none" isAnimationActive={false} />
                )}
                <Scatter data={rows} isAnimationActive={false}>
                  {rows.map(r => (
                    <Cell key={r.variantId} fill={r.inDistribution ? '#3b82f6' : '#f59e0b'} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            {anyExtrapolated && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Amber points fell outside the model&rsquo;s training range — treat those predictions as extrapolation.
              </p>
            )}
          </div>

          {/* Within-scaffold — the number that matters most */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900">Within-scaffold ranking</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">
              The same correlation computed separately for variants of each parent. This is the
              harder and more useful test: a model can rank unrelated proteins well by picking up
              broad properties and still fail to order two point mutants of one enzyme.
            </p>
            {data.byParent.length === 0 ? (
              <p className="text-sm text-gray-400">
                No parent scaffold has 3 or more paired variants yet. Linking variants to a parent
                (and measuring several mutants of the same protein) unlocks this.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Parent</th>
                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Variants</th>
                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Spearman ρ</th>
                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">p</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.byParent.map(g => (
                    <tr key={g.parentId}>
                      <td className="py-2.5 text-sm font-medium text-gray-900">{g.parentName || g.parentId}</td>
                      <td className="py-2.5 text-sm text-gray-600">{g.n}</td>
                      <td className="py-2.5 text-sm font-mono font-medium"
                        style={{ color: g.spearman >= 0.5 ? '#16a34a' : g.spearman < 0 ? '#dc2626' : '#64748b' }}>
                        {g.spearman >= 0 ? '+' : ''}{g.spearman.toFixed(3)}
                      </td>
                      <td className="py-2.5 text-sm font-mono text-gray-500">{g.spearmanP.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Per-variant detail */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 pb-3">
              <h3 className="font-semibold text-gray-900">Variant by variant</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Ordered by predicted rank. The rank gap column shows where the model was most wrong.
              </p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-y border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Predicted</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Measured</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Gap</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Variant</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">ΔG</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{data.metric.label}</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.variantId} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm text-gray-500">#{r.predictedRank}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">#{r.measuredRank}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.rankError === 0 ? 'bg-green-100 text-green-700'
                          : r.rankError <= 2 ? 'bg-gray-100 text-gray-600'
                          : 'bg-red-100 text-red-700'}`}>
                        {r.rankError === 0 ? 'exact' : `±${r.rankError}`}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-gray-900">{r.name}</div>
                      {r.mutations?.length > 0 && (
                        <div className="text-xs text-gray-400 font-mono">{r.mutations.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono">
                      <span style={{ color: r.predictedDg < 0 ? '#16a34a' : '#dc2626' }}>
                        {r.predictedDg > 0 ? '+' : ''}{r.predictedDg.toFixed(2)}
                      </span>
                      {!r.inDistribution && (
                        <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1.5 -mt-0.5"
                          title={r.flags?.join('\n\n')} />
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-700">
                      {r.measured}
                      {r.measuredSd != null && <span className="text-gray-400"> ± {r.measuredSd}</span>}
                      <span className="text-gray-400 text-xs ml-1">
                        {r.unit}{r.nReplicates > 1 ? ` (n=${r.nReplicates})` : ''}
                      </span>
                    </td>
                    <td className="px-5 py-3"><ModelBadge modelVersion={r.modelVersion} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Why no absolute error */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex gap-2.5">
            <Info className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-700">This page reports agreement in ranking, not absolute error.</span>{' '}
              A predicted ΔG is in kcal/mol and a measurement here is in {data.metric.unit || 'assay units'} —
              subtracting one from the other would not mean anything. Ranking is also the part of the
              output with the strongest evidence behind it: the projector fix rescaled every absolute
              value the model produces while leaving the ordering essentially untouched (ρ = 0.9993).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
