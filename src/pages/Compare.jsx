import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, GitCompare, BarChart3, Loader2, AlertCircle, CheckSquare, Square,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import api from '../services/apiClient';

const PALETTE = [
  '#3b82f6','#10b981','#ef4444','#f59e0b','#8b5cf6','#06b6d4',
  '#f97316','#ec4899','#84cc16','#6366f1','#14b8a6','#eab308',
];

const METRIC_COLS = [
  { key: 'halfLife',   label: 'Half-life (min)', unit: 'min',  mono: true },
  { key: 'tm',         label: 'Apparent Tm',     unit: '°C',   mono: true },
  { key: 'foldChange', label: 'Fold vs WT',       unit: '×',    mono: true },
  { key: 'r2',         label: 'Best R²',          unit: '',     mono: true },
  { key: 'n',          label: 'Replicates',       unit: '',     mono: false },
];

// Group measurements by sample base name (strips trailing _R<n>)
function groupBySample(measurements) {
  const groups = {};
  for (const m of measurements) {
    const base = m.replicateGroup
      ? m.replicateGroup.replace(/_R\d+$/, '')
      : (m.sampleId || m.sampleType);
    if (!base) continue;
    if (!groups[base]) groups[base] = [];
    groups[base].push(m);
  }
  return groups;
}

// Aggregate metrics across replicates for a sample group
function aggregateMetrics(ms) {
  const halves = [], folds = [], tms = [], r2s = [];
  for (const m of ms) {
    for (const d of m.derivedMetrics || []) {
      if (d.metricType === 'half_life'   && d.value != null) { halves.push(d.value); if (d.goodnessOfFit != null) r2s.push(d.goodnessOfFit); }
      if (d.metricType === 'fold_change'  && d.value != null) folds.push(d.value);
      if (d.metricType === 'apparent_tm'  && d.value != null) tms.push(d.value);
    }
  }
  const avg  = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)) : null;
  const best = arr => arr.length ? parseFloat(Math.max(...arr).toFixed(3)) : null;
  return {
    halfLife:   avg(halves),
    bestHalfLife: best(halves),
    tm:         avg(tms),
    foldChange: avg(folds),
    r2:         avg(r2s),
    n:          ms.length,
  };
}

// Build mean kinetic time series for a group of measurements
function buildMeanSeries(ms) {
  const byTime = {};
  let hasTimeSeries = false;
  for (const m of ms) {
    for (const r of m.rawReadings || []) {
      if (r.timepoint == null) continue;
      hasTimeSeries = true;
      if (!byTime[r.timepoint]) byTime[r.timepoint] = { sum: 0, n: 0 };
      byTime[r.timepoint].sum += r.fluorescence;
      byTime[r.timepoint].n  += 1;
    }
  }
  if (!hasTimeSeries) return null;
  return Object.entries(byTime)
    .map(([t, { sum, n }]) => ({ time: parseFloat(t), value: parseFloat((sum / n).toFixed(1)) }))
    .sort((a, b) => a.time - b.time);
}

export default function Compare() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects,     setProjects]     = useState([]);
  const [projectId,    setProjectId]    = useState(searchParams.get('projectId') || '');
  const [experiments,  setExperiments]  = useState([]);
  const [experimentId, setExperimentId] = useState(searchParams.get('experimentId') || '');
  const [measurements, setMeasurements] = useState([]);
  const [experiment,   setExperiment]   = useState(null);
  const [selected,     setSelected]     = useState(new Set());
  const [loadingExp,   setLoadingExp]   = useState(false);
  const [error,        setError]        = useState('');

  // Load projects once
  useEffect(() => {
    api.get('/projects').then(({ projects: p }) => {
      setProjects(p || []);
      if (!projectId && p?.length > 0) setProjectId(p[0]._id);
    }).catch(console.error);
  }, [projectId]);

  // Load experiments when project changes
  useEffect(() => {
    if (!projectId) return;
    api.get(`/experiments?projectId=${projectId}`).then(({ experiments: e }) => {
      setExperiments(e || []);
      setExperimentId(id => id || (e?.[0]?._id ?? ''));
      setMeasurements([]);
      setSelected(new Set());
    }).catch(console.error);
  }, [projectId]);

  // Load experiment measurements
  useEffect(() => {
    if (!experimentId) return;
    setLoadingExp(true);
    setError('');
    api.get(`/experiments/${experimentId}`)
      .then(({ experiment: exp, measurements: ms }) => {
        setExperiment(exp);
        setMeasurements(ms || []);
        setSelected(new Set());
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingExp(false));
  }, [experimentId]);

  const sampleGroups = useMemo(() => groupBySample(measurements), [measurements]);

  const sampleList = useMemo(() =>
    Object.entries(sampleGroups).map(([name, ms]) => ({
      name,
      metrics: aggregateMetrics(ms),
      kinetic: buildMeanSeries(ms),
      sampleType: ms[0]?.sampleType || 'VARIANT',
    })).sort((a, b) => {
      const ha = a.metrics.halfLife ?? -Infinity;
      const hb = b.metrics.halfLife ?? -Infinity;
      return hb - ha;
    }),
  [sampleGroups]);

  const hasKinetic = sampleList.some(s => s.kinetic);

  const selectedList = useMemo(
    () => sampleList.filter(s => selected.has(s.name)),
    [sampleList, selected],
  );

  // Build overlaid kinetic chart data
  const kineticChart = useMemo(() => {
    if (selectedList.length === 0) return null;
    const seriesWithData = selectedList.filter(s => s.kinetic);
    if (seriesWithData.length === 0) return null;

    const allTimes = [...new Set(
      seriesWithData.flatMap(s => s.kinetic.map(p => p.time))
    )].sort((a, b) => a - b);

    return allTimes.map(t => {
      const point = { time: t };
      for (const s of seriesWithData) {
        const pt = s.kinetic.find(p => p.time === t);
        if (pt) point[s.name] = pt.value;
      }
      return point;
    });
  }, [selectedList]);

  const toggleAll = () => {
    if (selected.size === sampleList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sampleList.map(s => s.name)));
    }
  };

  const toggle = (name) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs space-y-1.5">
        <p className="font-semibold text-gray-600">t = {label} min</p>
        {payload.map(p => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-gray-600 truncate max-w-[140px]">{p.dataKey}</span>
            </div>
            <span className="font-mono font-semibold" style={{ color: p.color }}>{p.value} RFU</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <button onClick={() => navigate('/experiments')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Experiments
      </button>

      {/* Header + selectors */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <GitCompare className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Variant Comparison</h2>
            <p className="text-sm text-gray-500">Overlay kinetic curves and compare stability metrics side-by-side</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Experiment</label>
            <select value={experimentId} onChange={e => setExperimentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
              {experiments.length === 0 && <option value="">No experiments yet</option>}
              {experiments.map(e => (
                <option key={e._id} value={e._id}>
                  {e.name} {e.date ? `(${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm p-4 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loadingExp ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading experiment data…</span>
        </div>
      ) : sampleList.length > 0 ? (
        <div className="grid grid-cols-12 gap-5">

          {/* ── Left: sample selector ── */}
          <div className="col-span-4 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Select samples
                {selected.size > 0 && (
                  <span className="ml-2 text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                    {selected.size} selected
                  </span>
                )}
              </h3>
              <button onClick={toggleAll}
                className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">
                {selected.size === sampleList.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
              {sampleList.map((s, i) => {
                const isSelected = selected.has(s.name);
                const colorIdx = selectedList.findIndex(x => x.name === s.name);
                const color = colorIdx >= 0 ? PALETTE[colorIdx % PALETTE.length] : null;
                return (
                  <div key={s.name}
                    onClick={() => toggle(s.name)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-purple-600" />
                          : <Square className="w-4 h-4 text-gray-300" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {color && <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                          <span className="font-medium text-gray-900 text-xs truncate">{s.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-400 font-mono">
                          {s.metrics.halfLife != null && <span>t½ {s.metrics.halfLife} min</span>}
                          {s.metrics.tm != null && <span>Tm {s.metrics.tm}°C</span>}
                          {s.metrics.foldChange != null && <span>{s.metrics.foldChange}× WT</span>}
                        </div>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                        s.sampleType === 'POSITIVE_CONTROL' ? 'bg-green-100 text-green-700' :
                        s.sampleType === 'NEGATIVE_CONTROL' ? 'bg-red-100 text-red-700' :
                        s.sampleType === 'REFERENCE' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{s.sampleType.replace('_', ' ')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: charts + table ── */}
          <div className="col-span-8 space-y-5">

            {selected.size < 2 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-16 text-center gap-3">
                <GitCompare className="w-10 h-10 text-gray-200" />
                <p className="text-gray-500 font-medium text-sm">Select 2 or more samples to compare</p>
                <p className="text-gray-300 text-xs">
                  {!hasKinetic ? 'This experiment has endpoint data — metrics table will appear' : 'Kinetic curves and metrics will overlay here'}
                </p>
              </div>
            ) : (
              <>
                {/* Kinetic chart */}
                {kineticChart && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <h3 className="font-semibold text-gray-900 text-sm mb-1">Kinetic Decay — Overlay</h3>
                    <p className="text-xs text-gray-400 mb-4">Mean fluorescence across replicates. Decreasing signal = protein unfolding.</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={kineticChart} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" label={{ value: 'Time (min)', position: 'insideBottom', offset: -2, fontSize: 10 }} tick={{ fontSize: 10 }} />
                        <YAxis label={{ value: 'Fluorescence (RFU)', angle: -90, position: 'insideLeft', fontSize: 10 }} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                        {selectedList.filter(s => s.kinetic).map((s, i) => (
                          <Line key={s.name} type="monotone" dataKey={s.name}
                            stroke={PALETTE[i % PALETTE.length]} strokeWidth={2}
                            dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Half-life bar comparison */}
                {selectedList.some(s => s.metrics.halfLife != null) && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <h3 className="font-semibold text-gray-900 text-sm mb-4">Half-life Comparison</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={selectedList.filter(s => s.metrics.halfLife != null).map((s, i) => ({
                          name: s.name.length > 20 ? s.name.slice(0, 18) + '…' : s.name,
                          halfLife: s.metrics.halfLife,
                          fill: PALETTE[i % PALETTE.length],
                        }))}
                        margin={{ top: 5, right: 10, left: 0, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10 }} unit=" min" />
                        <Tooltip formatter={v => [`${v} min`, 'Mean half-life']} contentStyle={{ fontSize: 11 }} />
                        <Bar dataKey="halfLife" radius={[4, 4, 0, 0]}>
                          {selectedList.filter(s => s.metrics.halfLife != null).map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Metrics table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 text-sm">Side-by-side Metrics</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Sample</th>
                          {METRIC_COLS.map(c => (
                            <th key={c.key} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedList.map((s, i) => {
                          const isBestHL = s.metrics.halfLife != null &&
                            s.metrics.halfLife === Math.max(...selectedList.map(x => x.metrics.halfLife ?? -Infinity));
                          return (
                            <tr key={s.name} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                                  <span className="font-medium text-gray-900 text-xs">{s.name}</span>
                                  {isBestHL && (
                                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Best</span>
                                  )}
                                </div>
                              </td>
                              {METRIC_COLS.map(c => {
                                const val = s.metrics[c.key];
                                const isMax = val != null && c.key !== 'n' &&
                                  val === Math.max(...selectedList.map(x => x.metrics[c.key] ?? -Infinity));
                                return (
                                  <td key={c.key} className="px-4 py-3 text-right">
                                    {val != null ? (
                                      <span className={`${c.mono ? 'font-mono' : ''} text-xs ${isMax ? 'text-green-700 font-bold' : 'text-gray-700'}`}>
                                        {val}{c.unit}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300 text-xs">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs text-gray-400">Values are means across replicates. Green = best in selection. Run Analytics first to populate metrics.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : experimentId && !loadingExp ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No measurements in this experiment</p>
          <p className="text-gray-400 text-sm mt-1">Upload data first, then come back to compare.</p>
          <button onClick={() => navigate(`/experiments/${experimentId}`)}
            className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium">
            Go to experiment →
          </button>
        </div>
      ) : null}
    </div>
  );
}
