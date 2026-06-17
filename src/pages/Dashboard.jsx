import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen, FlaskConical, Activity, TrendingUp, Plus, ChevronRight,
  CheckCircle2, Dna, BarChart3, Cpu, WifiOff, Upload, Clock, AlertCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';

// ── Animated integer counter ─────────────────────────────────────────────────

function useCounter(target, duration = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return; }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);        // cubic ease-out
      setValue(Math.round(ease * target));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

// ── Stat card with animated counter ─────────────────────────────────────────

function StatCard({ label, value, icon: Icon, bg, iconColor, loading }) {
  const count = useCounter(loading ? 0 : (value ?? 0));
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      {loading ? (
        <div className="h-8 w-14 bg-gray-100 rounded-lg animate-pulse mb-1" />
      ) : (
        <div className="text-2xl font-bold text-gray-900 tabular-nums">
          {count.toLocaleString()}
        </div>
      )}
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// ── ML model status card ─────────────────────────────────────────────────────

function ModelStatusCard({ ml, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-6 bg-gray-50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const rows = ml?.modelReady && ml?.online
    ? [
        { label: 'Algorithm',        value: ml.algorithm,                      mono: true  },
        { label: 'Training variants', value: ml.nVariants,                      mono: false },
        { label: 'Features',          value: ml.nFeatures,                      mono: false },
        { label: 'LOO R²',            value: ml.looR2?.toFixed(3),              mono: true  },
        { label: 'LOO RMSE',          value: ml.looRMSE?.toFixed(3),            mono: true  },
        { label: 'Stability range',   value: ml.stabilityRange
            ? `${ml.stabilityRange.min?.toFixed(2)} – ${ml.stabilityRange.max?.toFixed(2)}`
            : null,                                                              mono: true  },
      ]
    : [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-sm">ML Model</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ml?.online ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <span className={`text-xs font-medium ${ml?.online ? 'text-green-600' : 'text-red-500'}`}>
            {ml?.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {ml?.online && ml?.modelReady ? (
        <>
          <div className="space-y-0 divide-y divide-gray-50 flex-1">
            {rows.map(({ label, value, mono }) => value != null && (
              <div key={label} className="flex items-center justify-between py-2">
                <span className="text-xs text-gray-500">{label}</span>
                <span className={`text-xs font-semibold text-gray-800 ${mono ? 'font-mono' : ''}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            <span className="text-xs text-green-700 font-medium">
              Model ready · {ml.nVariants} variants · {ml.nFeatures} features
            </span>
          </div>
        </>
      ) : ml?.online ? (
        <div className="flex-1 flex flex-col items-center justify-center py-4 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-amber-400" />
          <p className="text-sm font-medium text-gray-700">Service online — model not trained</p>
          <p className="text-xs text-gray-400">POST /train to train from CSV data</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-4 text-center space-y-2">
          <WifiOff className="w-8 h-8 text-gray-200" />
          <p className="text-sm font-medium text-gray-700">ML service offline</p>
          <p className="text-xs text-gray-400">Predictions fall back to BLOSUM62 scoring</p>
        </div>
      )}
    </div>
  );
}

// ── Assay breakdown mini chart ────────────────────────────────────────────────

const ASSAY_META = {
  THERMAL:        { label: 'Thermal',       color: '#ef4444' },
  OTHER:          { label: 'Other (FACS)',  color: '#6b7280' },
  PH:             { label: 'pH',            color: '#3b82f6' },
  SOLVENT:        { label: 'Solvent',       color: '#8b5cf6' },
  IONIC_STRENGTH: { label: 'Ionic Str.',    color: '#10b981' },
};

const ASSAY_BADGE = {
  THERMAL:        'bg-red-100 text-red-700',
  OTHER:          'bg-gray-100 text-gray-600',
  PH:             'bg-blue-100 text-blue-700',
  SOLVENT:        'bg-purple-100 text-purple-700',
  IONIC_STRENGTH: 'bg-green-100 text-green-700',
};

const STATUS_STYLE = {
  COMPLETED: 'bg-green-100 text-green-700',
  RUNNING:   'bg-blue-100 text-blue-700',
  QUEUED:    'bg-gray-100 text-gray-600',
  FAILED:    'bg-red-100 text-red-600',
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

const CAMPAIGN_METRICS = [
  { key: 'meanHalfLife',   bestKey: 'bestHalfLife',   label: 'Half-life (mean)',  unit: 'min',  color: '#3b82f6', bestColor: '#93c5fd' },
  { key: 'meanFoldChange', bestKey: 'bestFoldChange', label: 'Fold change (mean)', unit: '×',   color: '#10b981', bestColor: '#6ee7b7' },
  { key: 'meanTm',         bestKey: 'bestTm',         label: 'Apparent Tm (mean)', unit: '°C',  color: '#ef4444', bestColor: '#fca5a5' },
];

function CampaignTrend({ projects }) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [metric,    setMetric]    = useState(0);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (projects.length > 0 && !projectId) setProjectId(projects[0]._id);
  }, [projects, projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/analytics/campaign/${projectId}`)
      .then(res => setData(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  const m = CAMPAIGN_METRICS[metric];
  const hasData = data?.experiments?.some(e => e[m.key] != null);

  const chartData = (data?.experiments || []).map(e => ({
    name:     e.name.length > 18 ? e.name.slice(0, 16) + '…' : e.name,
    fullName: e.name,
    date:     e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    [m.key]:     e[m.key],
    [m.bestKey]: e[m.bestKey],
    measurements: e.measurements,
  }));

  // Reference line: mean across all experiments that have data
  const validVals = chartData.map(d => d[m.key]).filter(v => v != null);
  const overallMean = validVals.length
    ? parseFloat((validVals.reduce((a, b) => a + b, 0) / validVals.length).toFixed(3))
    : null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const entry = chartData.find(d => d.name === label) || {};
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs space-y-1.5 min-w-[150px]">
        <p className="font-semibold text-gray-900 truncate">{entry.fullName || label}</p>
        {entry.date && <p className="text-gray-400">{entry.date}</p>}
        {payload.map(p => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="text-gray-500">{p.name}</span>
            <span className="font-mono font-semibold" style={{ color: p.color }}>
              {p.value != null ? `${p.value} ${m.unit}` : '—'}
            </span>
          </div>
        ))}
        {entry.measurements > 0 && (
          <p className="text-gray-400 border-t border-gray-100 pt-1.5">{entry.measurements} measurements</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-sm">Campaign Stability Trend</h3>
          {data?.project && <span className="text-xs text-gray-400">— {data.project}</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Metric toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {CAMPAIGN_METRICS.map((cm, i) => (
              <button key={cm.key} onClick={() => setMetric(i)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  metric === i ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}>
                {cm.label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Project selector */}
          {projects.length > 1 && (
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-52 flex items-center justify-center">
          <div className="space-y-2 w-full px-4">
            {[1, 2, 3].map(i => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + i * 12}%` }} />)}
          </div>
        </div>
      ) : !hasData ? (
        <div className="h-52 flex flex-col items-center justify-center text-center gap-2">
          <BarChart3 className="w-8 h-8 text-gray-200" />
          <p className="text-gray-400 text-sm">No analytics data yet for this project</p>
          <p className="text-gray-300 text-xs">Upload experiment data and click "Run Analytics" on each experiment</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10 }} unit={` ${m.unit}`} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
            {overallMean != null && (
              <ReferenceLine y={overallMean} stroke="#d1d5db" strokeDasharray="4 2"
                label={{ value: `avg ${overallMean}`, position: 'insideTopRight', fontSize: 9, fill: '#9ca3af' }} />
            )}
            <Line type="monotone" dataKey={m.key}  name={m.label} stroke={m.color}
              strokeWidth={2} dot={{ r: 3, fill: m.color }} activeDot={{ r: 5 }} connectNulls={false} />
            <Line type="monotone" dataKey={m.bestKey} name={`Best ${m.label.split(' ')[0]}`}
              stroke={m.bestColor} strokeWidth={1.5} strokeDasharray="4 3"
              dot={{ r: 2 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {data?.experiments?.length > 0 && (
        <p className="text-xs text-gray-400 mt-1 text-right">
          {data.experiments.length} experiment{data.experiments.length !== 1 ? 's' : ''} ·
          solid = mean · dashed = best replicate
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);

  const load = useCallback(async () => {
    try {
      const [data, projData] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/projects'),
      ]);
      setStats(data);
      setProjects(projData.projects || []);
    } catch (err) {
      console.error('Dashboard stats error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = stats?.counts   ?? {};
  const ml     = stats?.mlService ?? {};
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const assayData = Object.entries(stats?.assayBreakdown ?? {}).map(([type, count]) => ({
    name:  ASSAY_META[type]?.label ?? type,
    count,
    color: ASSAY_META[type]?.color ?? '#9ca3af',
  }));

  const predTotal = counts.predictions?.total ?? 1;

  const statCards = [
    { label: 'Projects',          value: counts.projects,          icon: FolderOpen,  bg: 'bg-blue-50',   iconColor: 'text-blue-600'   },
    { label: 'Experiments',       value: counts.experiments,       icon: BarChart3,   bg: 'bg-red-50',    iconColor: 'text-red-500'    },
    { label: 'Variants Screened', value: counts.variants,          icon: Dna,         bg: 'bg-teal-50',   iconColor: 'text-teal-600'   },
    { label: 'Measurements',      value: counts.measurements,      icon: Activity,    bg: 'bg-purple-50', iconColor: 'text-purple-600' },
    { label: 'Predictions Run',   value: counts.predictions?.total, icon: FlaskConical, bg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    { label: 'Mutations Analyzed',value: counts.mutationsAnalyzed, icon: TrendingUp,  bg: 'bg-green-50',  iconColor: 'text-green-600'  },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {loading
              ? 'Loading platform stats…'
              : `${counts.experiments ?? 0} experiments · ${counts.variants ?? 0} variants screened · ${counts.predictions?.completed ?? 0} predictions completed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/experiments/new')}
            className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors">
            <Upload className="w-4 h-4" />
            Upload Data
          </button>
          <button onClick={() => navigate('/predict')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            New Prediction
          </button>
        </div>
      </div>

      {/* ── Six stat cards ── */}
      <div className="grid grid-cols-6 gap-4">
        {statCards.map(s => <StatCard key={s.label} {...s} loading={loading} />)}
      </div>

      {/* ── Row 2: ML status · Assay breakdown · Prediction health ── */}
      <div className="grid grid-cols-3 gap-5">

        {/* ML model status */}
        <ModelStatusCard ml={ml} loading={loading} />

        {/* Assay breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-sm">Experiments by Assay Type</h3>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />)}
            </div>
          ) : assayData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={assayData} layout="vertical" margin={{ left: 4, right: 12, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip
                  formatter={(v) => [v, 'experiments']}
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {assayData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-10 text-center text-gray-300 text-sm">No experiments yet</div>
          )}
        </div>

        {/* Prediction health */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-sm">Prediction Health</h3>
          </div>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {[
                { label: 'Completed', value: counts.predictions?.completed ?? 0, barColor: 'bg-green-400', textColor: 'text-green-700' },
                { label: 'Active',    value: counts.predictions?.active    ?? 0, barColor: 'bg-blue-400',  textColor: 'text-blue-700'  },
                { label: 'Failed',    value: counts.predictions?.failed    ?? 0, barColor: 'bg-red-400',   textColor: 'text-red-600'   },
              ].map(({ label, value, barColor, textColor }) => {
                const pct = predTotal > 0 ? Math.round((value / predTotal) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-500">{label}</span>
                      <span className={`font-semibold ${textColor}`}>{value}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all duration-700`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}

              <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 text-center">
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="text-lg font-bold text-gray-900">{predTotal}</div>
                  <div className="text-xs text-gray-400">Total</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="text-lg font-bold text-gray-900">
                    {predTotal > 0 ? Math.round(((counts.predictions?.completed ?? 0) / predTotal) * 100) : 0}%
                  </div>
                  <div className="text-xs text-gray-400">Success rate</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Campaign trend ── */}
      {!loading && projects.length > 0 && (
        <CampaignTrend projects={projects} />
      )}

      {/* ── Row 4: Recent experiments + recent predictions ── */}
      <div className="grid grid-cols-5 gap-5">

        {/* Recent experiments */}
        <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Recent Experiments</h3>
            <button onClick={() => navigate('/experiments')}
              className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />)}
            </div>
          ) : (stats?.recentExperiments ?? []).length === 0 ? (
            <div className="p-8 text-center">
              <BarChart3 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No experiments yet</p>
              <button onClick={() => navigate('/experiments/new')}
                className="mt-2 text-blue-600 text-xs font-medium hover:text-blue-700">
                Upload data →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(stats.recentExperiments).map(exp => (
                <div key={exp._id} onClick={() => navigate(`/experiments/${exp._id}`)}
                  className="px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-xs truncate">{exp.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ASSAY_BADGE[exp.assayType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {exp.assayType}
                      </span>
                      {exp.date && (
                        <span className="text-gray-400 text-xs">
                          {new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent predictions */}
        <div className="col-span-3 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Recent Predictions</h3>
            <button onClick={() => navigate('/predict')}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />)}
            </div>
          ) : (stats?.recentPredictions ?? []).length === 0 ? (
            <div className="p-8 text-center">
              <FlaskConical className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No predictions yet</p>
              <button onClick={() => navigate('/predict')}
                className="mt-2 text-blue-600 text-xs font-medium hover:text-blue-700">
                Run first prediction →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(stats.recentPredictions).map(pred => (
                <div key={pred._id} onClick={() => navigate(`/results/${pred._id}`)}
                  className="px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    pred.status === 'COMPLETED' ? 'bg-green-50' :
                    pred.status === 'FAILED'    ? 'bg-red-50'   : 'bg-blue-50'
                  }`}>
                    {pred.status === 'COMPLETED'
                      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                      : pred.status === 'FAILED'
                      ? <AlertCircle  className="w-4 h-4 text-red-400" />
                      : <Clock        className="w-4 h-4 text-blue-400" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-xs truncate">
                      {pred.fastaSequence?.split('\n')[0]?.replace('>', '')
                        || `Prediction #${String(pred._id).slice(-6)}`}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                      {pred.modelVersion && (
                        <span className="font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs leading-none">
                          {pred.modelVersion.split(' ')[0]}
                        </span>
                      )}
                      {pred.candidatesCount > 0 && <span>{pred.candidatesCount} candidates</span>}
                      <span>{new Date(pred.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>

                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${STATUS_STYLE[pred.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {pred.status}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
