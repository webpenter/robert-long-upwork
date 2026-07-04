import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Dna, FlaskConical, BarChart3, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ErrorBar, ResponsiveContainer,
} from 'recharts';
import api from '../services/apiClient';

const METRIC_UNIT = {
  apparent_tm: '°C', half_life: 'min', fold_change: '×', rate_constant: '', ec50: '', other: '',
};

// Group this variant's measurements by experiment and reduce replicates to mean ± SE.
function groupMetricByExperiment(measurements, metricType) {
  const groups = {};
  for (const m of measurements) {
    const d = m.derivedMetrics?.find(x => x.metricType === metricType);
    if (!d || d.value == null) continue;
    const key = m.experiment?._id || m.experiment?.name || 'Unknown';
    if (!groups[key]) groups[key] = { name: m.experiment?.name || 'Unknown', values: [] };
    groups[key].values.push(d.value);
  }
  return Object.values(groups).map(g => {
    const n = g.values.length;
    const mean = g.values.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(g.values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    const se = n > 1 ? sd / Math.sqrt(n) : 0;
    return { name: g.name, n, mean: parseFloat(mean.toFixed(3)), se: parseFloat(se.toFixed(3)) };
  });
}

const ASSAY_COLORS = {
  THERMAL: 'bg-red-100 text-red-700',
  PH: 'bg-blue-100 text-blue-700',
  SOLVENT: 'bg-purple-100 text-purple-700',
  IONIC_STRENGTH: 'bg-green-100 text-green-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

const METRIC_LABELS = {
  apparent_tm: 'Apparent Tm',
  half_life: 'Half-life',
  fold_change: 'Fold change',
  rate_constant: 'Rate const.',
  ec50: 'EC50',
  other: 'Other',
};

export default function VariantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [variant, setVariant] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seqExpanded, setSeqExpanded] = useState(false);
  const [metric, setMetric] = useState(null);

  // Which derived metrics does this variant actually have data for?
  const availableMetrics = useMemo(() => {
    const set = new Set();
    measurements.forEach(m => m.derivedMetrics?.forEach(d => { if (d.value != null) set.add(d.metricType); }));
    return [...set];
  }, [measurements]);

  const activeMetric = metric && availableMetrics.includes(metric) ? metric : availableMetrics[0];
  const chartData = useMemo(
    () => (activeMetric ? groupMetricByExperiment(measurements, activeMetric) : []),
    [measurements, activeMetric],
  );

  useEffect(() => {
    api.get(`/variants/${id}`)
      .then(({ variant, measurements }) => {
        setVariant(variant);
        setMeasurements(measurements);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-gray-400 min-h-64">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading variant...</span>
      </div>
    );
  }

  if (error || !variant) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-gray-400">{error || 'Variant not found'}</p>
        <button onClick={() => navigate('/variants')}
          className="text-blue-600 hover:text-blue-700 font-medium text-sm">
          ← Back to Variants
        </button>
      </div>
    );
  }

  const rawSeq = variant.fastaSequence?.replace(/^>.*\n/, '').replace(/\s/g, '') || '';
  const experimentCount = new Set(measurements.map(m => m.experiment?._id).filter(Boolean)).size;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <button onClick={() => navigate('/variants')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Variants
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Dna className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{variant.name}</h2>
                {variant.parent && (
                  <button onClick={() => navigate(`/variants/${variant.parent._id}`)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-0.5">
                    Parent: {variant.parent.name}
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Mutations */}
            {variant.mutations?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mutations ({variant.mutations.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {variant.mutations.map((m, i) => (
                    <span key={i} className="text-sm font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100 font-semibold">
                      {m.notation || `${m.from}${m.position}${m.to}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {variant.familyAnnotation && (
              <p className="text-sm text-gray-500 mt-3">Family: <strong className="text-gray-700">{variant.familyAnnotation}</strong></p>
            )}
          </div>

          <div className="text-right space-y-2 flex-shrink-0">
            {variant.structurePdbId && (
              <div className="text-xs bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full font-mono border border-teal-100 inline-block">
                PDB: {variant.structurePdbId}
              </div>
            )}
            <div>
              <button onClick={() => navigate(`/predict?variantId=${variant._id}`)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <FlaskConical className="w-4 h-4" />
                Predict on this variant
              </button>
            </div>
          </div>
        </div>

        {/* FASTA sequence */}
        {rawSeq && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sequence ({rawSeq.length} aa)</p>
              <button onClick={() => setSeqExpanded(e => !e)}
                className="text-xs text-blue-600 hover:text-blue-700">{seqExpanded ? 'Collapse' : 'Expand'}</button>
            </div>
            <div className={`font-mono text-xs text-gray-600 bg-gray-50 rounded-lg p-3 break-all leading-relaxed ${seqExpanded ? '' : 'max-h-16 overflow-hidden'}`}>
              {rawSeq}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
          {[
            { label: 'Measurements', value: measurements.length, icon: BarChart3, bg: 'bg-blue-50', color: 'text-blue-600' },
            { label: 'Experiments', value: experimentCount, icon: FlaskConical, bg: 'bg-purple-50', color: 'text-purple-600' },
            { label: 'Mutations', value: variant.mutations?.length || 0, icon: Dna, bg: 'bg-teal-50', color: 'text-teal-600' },
          ].map(({ label, value, icon: Icon, bg, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <div className="text-xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance chart (mean ± SE per experiment) */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h3 className="font-semibold text-gray-900">Performance Across Experiments</h3>
            {availableMetrics.length > 1 && (
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {availableMetrics.map(mt => (
                  <button key={mt} onClick={() => setMetric(mt)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      mt === activeMetric ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {METRIC_LABELS[mt] || mt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">
            {METRIC_LABELS[activeMetric] || activeMetric} — replicate <strong>mean ± standard error</strong> for each experiment this variant appears in.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{ fontSize: 9 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, _n, p) => [
                `${v}${METRIC_UNIT[activeMetric] || ''} ± ${p.payload.se} (n=${p.payload.n})`,
                METRIC_LABELS[activeMetric] || activeMetric,
              ]} />
              <Bar dataKey="mean" fill="#3b82f6" radius={[3, 3, 0, 0]}>
                <ErrorBar dataKey="se" width={3} strokeWidth={1} stroke="#475569" direction="y" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Measurements history */}
      {measurements.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No measurements for this variant</p>
          <p className="text-gray-400 text-sm mt-1">Measurements will appear here once experiment data is uploaded.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Measurement History ({measurements.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Experiment</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assay</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Condition</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Metrics</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Well</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {measurements.map(m => (
                  <tr key={m._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {m.experiment ? (
                        <button onClick={() => navigate(`/experiments/${m.experiment._id}`)}
                          className="font-medium text-blue-600 hover:text-blue-700 text-sm text-left">
                          {m.experiment.name}
                        </button>
                      ) : <span className="text-gray-400 text-sm">—</span>}
                      {m.experiment?.date && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(m.experiment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.experiment?.assayType ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ASSAY_COLORS[m.experiment.assayType] || ASSAY_COLORS.OTHER}`}>
                          {m.experiment.assayType}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 space-y-0.5">
                      {m.condition?.temperature != null && <div>T = {m.condition.temperature}°C</div>}
                      {m.condition?.ph != null && <div>pH {m.condition.ph}</div>}
                      {m.condition?.solvent && <div>{m.condition.solvent}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {m.derivedMetrics?.length > 0 ? (
                        <div className="space-y-0.5">
                          {m.derivedMetrics.map((dm, i) => (
                            <div key={i} className="text-xs text-gray-700">
                              <span className="text-gray-400">{METRIC_LABELS[dm.metricType] || dm.metricType}: </span>
                              <strong>{dm.value != null ? `${dm.value.toFixed(2)}${dm.unit ? ` ${dm.unit}` : ''}` : '—'}</strong>
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">{m.wellPosition || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
