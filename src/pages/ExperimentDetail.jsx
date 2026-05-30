import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, FlaskConical, BarChart3, TestTube, AlertCircle, Download, PlayCircle, CheckCircle2, Grid3X3, Upload, X } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../services/apiClient';

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

// Palette for chart lines
const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4',
  '#f97316','#84cc16','#ec4899','#6366f1','#14b8a6','#eab308',
];

function QcBadge({ flags, excluded }) {
  if (excluded) return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Excluded</span>;
  if (flags?.length > 0) return <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">{flags[0]}</span>;
  return <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">Pass</span>;
}

// ── Plate heatmap ─────────────────────────────────────────────────────────────
// Parse well position like "A1", "B12", "H8" into {row, col}
function parseWell(well) {
  if (!well) return null;
  const m = well.match(/^([A-P])(\d+)$/i);
  if (!m) return null;
  return { row: m[1].toUpperCase().charCodeAt(0) - 65, col: parseInt(m[2], 10) - 1 };
}

function buildPlateData(measurements) {
  const wells = {};
  let maxVal = 0;
  for (const m of measurements) {
    if (!m.wellPosition) continue;
    const parsed = parseWell(m.wellPosition);
    if (!parsed) continue;
    const ep = m.rawReadings?.find(r => r.timepoint == null);
    if (!ep?.fluorescence) continue;
    const key = m.wellPosition.toUpperCase();
    if (!wells[key]) wells[key] = { ...parsed, value: 0, n: 0, sampleType: m.sampleType, label: m.replicateGroup?.split('_R')[0] || m.sampleType };
    wells[key].value += ep.fluorescence;
    wells[key].n += 1;
    if (wells[key].value / wells[key].n > maxVal) maxVal = wells[key].value / wells[key].n;
  }
  // Average replicates
  for (const k of Object.keys(wells)) {
    wells[k].value = wells[k].value / wells[k].n;
  }
  return { wells, maxVal };
}

const SAMPLE_TYPE_BORDER = {
  POSITIVE_CONTROL: '#22c55e',
  NEGATIVE_CONTROL: '#ef4444',
  REFERENCE: '#f59e0b',
  VARIANT: null,
};

function PlateHeatmap({ measurements }) {
  const [hovered, setHovered] = useState(null);
  const { wells, maxVal } = useMemo(() => buildPlateData(measurements), [measurements]);

  if (Object.keys(wells).length === 0) return (
    <div className="py-8 text-center text-gray-400 text-sm">No well-position data available for heatmap.</div>
  );

  // Detect plate format from max col/row
  const maxCol = Math.max(...Object.values(wells).map(w => w.col)) + 1;
  const maxRow = Math.max(...Object.values(wells).map(w => w.row)) + 1;
  const COLS = maxCol <= 12 ? 12 : 24;
  const ROWS = maxRow <= 8 ? 8 : 16;

  const colLabels = Array.from({ length: COLS }, (_, i) => i + 1);
  const rowLabels = Array.from({ length: ROWS }, (_, i) => String.fromCharCode(65 + i));

  // Color: white (low) → blue (mid) → green (high)
  function fluorColor(val) {
    if (!val || maxVal === 0) return '#f1f5f9';
    const t = val / maxVal;
    if (t < 0.5) {
      const r = Math.round(255 - t * 2 * (255 - 59));
      const g = Math.round(255 - t * 2 * (255 - 130));
      const b = 255;
      return `rgb(${r},${g},${b})`;
    } else {
      const t2 = (t - 0.5) * 2;
      const r = Math.round(59 - t2 * 59);
      const g = Math.round(130 + t2 * (197 - 130));
      const b = Math.round(255 - t2 * (255 - 94));
      return `rgb(${r},${g},${b})`;
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Column headers */}
          <div className="flex ml-7 mb-0.5">
            {colLabels.map(c => (
              <div key={c} className="w-7 h-4 text-center text-xs text-gray-400 font-mono">{c}</div>
            ))}
          </div>
          {rowLabels.map(row => (
            <div key={row} className="flex items-center mb-0.5">
              <div className="w-6 text-xs text-gray-400 font-mono text-right pr-1">{row}</div>
              {colLabels.map(col => {
                const key = `${row}${col}`;
                const w = wells[key];
                const border = w ? SAMPLE_TYPE_BORDER[w.sampleType] : null;
                return (
                  <div key={col}
                    className="w-7 h-7 rounded-sm cursor-pointer transition-transform hover:scale-110 relative"
                    style={{
                      backgroundColor: w ? fluorColor(w.value) : '#f8fafc',
                      outline: border ? `2px solid ${border}` : '1px solid #e2e8f0',
                      outlineOffset: border ? '-1px' : '0',
                    }}
                    onMouseEnter={() => setHovered(w ? { key, ...w } : null)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-10 h-3 rounded" style={{ background: 'linear-gradient(to right, #f1f5f9, rgb(59,130,255), rgb(0,197,94))' }} />
          <span>Low → High fluorescence</span>
        </div>
        {Object.entries(SAMPLE_TYPE_BORDER).filter(([,c]) => c).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ outline: `2px solid ${color}`, outlineOffset: '-1px', backgroundColor: '#f1f5f9' }} />
            <span>{type.replace('_', ' ').toLowerCase()}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="mt-2 inline-flex items-center gap-3 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg">
          <span className="font-mono font-bold">{hovered.key}</span>
          <span className="text-slate-300">{hovered.label}</span>
          <span className="font-semibold">{Math.round(hovered.value).toLocaleString()} RFU</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            hovered.sampleType === 'POSITIVE_CONTROL' ? 'bg-green-700' :
            hovered.sampleType === 'NEGATIVE_CONTROL' ? 'bg-red-700' :
            hovered.sampleType === 'REFERENCE' ? 'bg-amber-700' : 'bg-slate-600'
          }`}>{hovered.sampleType}</span>
        </div>
      )}
    </div>
  );
}

// ── Build kinetic chart data: one series per unique Sample_ID / sampleGroup ─
function buildKineticData(measurements) {
  const seriesMap = {};
  for (const m of measurements) {
    if (!m.rawReadings?.length) continue;
    const hasTimeSeries = m.rawReadings.some(r => r.timepoint != null);
    if (!hasTimeSeries) continue;
    const label = m.variant?.name || m.replicateGroup || m.sampleType;
    if (!seriesMap[label]) seriesMap[label] = {};
    for (const r of m.rawReadings) {
      const t = r.timepoint;
      if (t == null) continue;
      if (!seriesMap[label][t]) seriesMap[label][t] = { sum: 0, n: 0 };
      seriesMap[label][t].sum += r.fluorescence;
      seriesMap[label][t].n += 1;
    }
  }

  const seriesKeys = Object.keys(seriesMap);
  if (seriesKeys.length === 0) return null;

  const allTimes = [...new Set(seriesKeys.flatMap(k => Object.keys(seriesMap[k]).map(Number)))].sort((a, b) => a - b);

  const chartData = allTimes.map(t => {
    const point = { time: t };
    for (const key of seriesKeys) {
      const entry = seriesMap[key][t];
      if (entry) point[key] = parseFloat((entry.sum / entry.n).toFixed(1));
    }
    return point;
  });

  return { chartData, seriesKeys };
}

// ── Build endpoint bar chart: mean fluorescence per sample group ─────────────
function buildEndpointData(measurements) {
  const groups = {};
  for (const m of measurements) {
    if (!m.rawReadings?.length) continue;
    const ep = m.rawReadings.find(r => r.timepoint == null);
    if (!ep || ep.fluorescence == null) continue;
    const label = m.variant?.name || m.replicateGroup?.split('_R')[0] || m.sampleType;
    if (!groups[label]) groups[label] = { sum: 0, n: 0, sampleType: m.sampleType };
    groups[label].sum += ep.fluorescence;
    groups[label].n += 1;
  }
  return Object.entries(groups).map(([name, { sum, n, sampleType }]) => ({
    name,
    fluorescence: Math.round(sum / n),
    sampleType,
  })).sort((a, b) => b.fluorescence - a.fluorescence);
}

export default function ExperimentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [experiment, setExperiment] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('chart');
  const hasWellData = useMemo(() => measurements.some(m => m.wellPosition && parseWell(m.wellPosition)), [measurements]);
  const [analyticsRunning, setAnalyticsRunning] = useState(false);
  const [analyticsResult, setAnalyticsResult] = useState(null);

  // Inline upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const uploadRef = useRef();

  const handleInlineUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError('');
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('experimentId', id);
    try {
      const token = localStorage.getItem('enzml_access_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/uploads`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      // Poll parse status until completed/failed (max 15 s)
      const uploadId = data.upload._id;
      const deadline = Date.now() + 15000;
      const poll = async () => {
        if (Date.now() > deadline) {
          setUploadError('Timed out waiting for file parsing. The data may still appear — refresh the page in a moment.');
          setUploading(false);
          return;
        }
        try {
          const { upload } = await api.get(`/uploads/${uploadId}`);
          if (upload.parseStatus === 'completed') {
            await fetchExperiment();
            setShowUpload(false);
            setUploadFile(null);
            setUploading(false);
          } else if (upload.parseStatus === 'failed') {
            setUploadError(upload.parseErrors?.[0] || 'File parsing failed. Check that column headers match the expected CSV format.');
            setUploading(false);
          } else {
            setTimeout(poll, 600);
          }
        } catch (err) {
          setUploadError(err.message);
          setUploading(false);
        }
      };
      setTimeout(poll, 600);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
      setUploading(false);
    }
  };

  const fetchExperiment = useCallback(() => {
    return api.get(`/experiments/${id}`)
      .then(({ experiment, measurements }) => {
        setExperiment(experiment);
        setMeasurements(measurements);
      });
  }, [id]);

  useEffect(() => {
    fetchExperiment()
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [fetchExperiment]);

  const runAnalytics = async () => {
    setAnalyticsRunning(true);
    setAnalyticsResult(null);
    try {
      const result = await api.post(`/analytics/compute/${id}`);
      setAnalyticsResult(result);
      await fetchExperiment();
    } catch (err) {
      setAnalyticsResult({ message: `Error: ${err.message}` });
    } finally {
      setAnalyticsRunning(false);
    }
  };

  const kinetic = useMemo(() => buildKineticData(measurements), [measurements]);
  const endpointData = useMemo(() => buildEndpointData(measurements), [measurements]);
  const hasChart = kinetic || endpointData.length > 0;

  // Half-life rankings from computed derivedMetrics
  const halfLifeRanking = useMemo(() => {
    return measurements
      .map(m => {
        const hl = m.derivedMetrics?.find(d => d.metricType === 'half_life');
        if (!hl) return null;
        return {
          label: m.variant?.name || m.replicateGroup?.split('_R')[0] || m.sampleType,
          halfLife: hl.value,
          r2: hl.goodnessOfFit,
          sampleType: m.sampleType,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.halfLife - a.halfLife)
      .slice(0, 20);
  }, [measurements]);

  // Fold-change endpoint data (if analytics has been run)
  const foldChangeData = useMemo(() => {
    return measurements
      .map(m => {
        const fc = m.derivedMetrics?.find(d => d.metricType === 'fold_change');
        if (!fc) return null;
        return {
          name: m.variant?.name || m.replicateGroup?.split('_R')[0] || m.sampleType,
          foldChange: fc.value,
          sampleType: m.sampleType,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.foldChange - a.foldChange)
      .slice(0, 30);
  }, [measurements]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-gray-400 min-h-64">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading experiment...</span>
      </div>
    );
  }

  if (error || !experiment) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-gray-400">{error || 'Experiment not found'}</p>
        <button onClick={() => navigate('/experiments')}
          className="text-blue-600 hover:text-blue-700 font-medium text-sm">
          ← Back to Experiments
        </button>
      </div>
    );
  }

  const passCount = measurements.filter(m => !m.excluded && (!m.qcFlags || m.qcFlags.length === 0)).length;
  const variantCount = new Set(measurements.map(m => m.variant?._id).filter(Boolean)).size;

  const stats = [
    { label: 'Total measurements', value: measurements.length, icon: BarChart3, bg: 'bg-blue-50', color: 'text-blue-600' },
    { label: 'Variants tested', value: variantCount, icon: TestTube, bg: 'bg-purple-50', color: 'text-purple-600' },
    { label: 'Passing QC', value: passCount, icon: FlaskConical, bg: 'bg-green-50', color: 'text-green-600' },
    { label: 'Excluded', value: measurements.filter(m => m.excluded).length, icon: AlertCircle, bg: 'bg-red-50', color: 'text-red-500' },
  ];

  const exportCSV = () => {
    const headers = ['Well', 'Sample_ID', 'Sample_Type', 'Replicate_Group', 'Fluorescence_RFU', 'QC'];
    const rows = measurements.map(m => [
      m.wellPosition || '',
      m.variant?.name || '',
      m.sampleType,
      m.replicateGroup || '',
      m.rawReadings?.[0]?.fluorescence ?? '',
      m.excluded ? 'Excluded' : m.qcFlags?.[0] || 'Pass',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `experiment_${id}_data.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <button onClick={() => navigate('/experiments')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Experiments
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-gray-900">{experiment.name}</h2>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ASSAY_COLORS[experiment.assayType] || ASSAY_COLORS.OTHER}`}>
                {experiment.assayType}
              </span>
            </div>
            {experiment.notes && <p className="text-gray-500 text-sm">{experiment.notes}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {analyticsResult && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {analyticsResult.message}
              </span>
            )}
            {measurements.length > 0 && (
              <button onClick={runAnalytics} disabled={analyticsRunning}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {analyticsRunning
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <PlayCircle className="w-4 h-4" />}
                {analyticsRunning ? 'Running…' : 'Run Analytics'}
              </button>
            )}
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button onClick={() => { setShowUpload(v => !v); setUploadFile(null); setUploadError(''); }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Upload data</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-5 text-sm text-gray-500 mb-5">
          {experiment.date && (
            <span>Date: <strong className="text-gray-700">
              {new Date(experiment.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </strong></span>
          )}
          {experiment.operator && <span>Operator: <strong className="text-gray-700">{experiment.operator}</strong></span>}
          {experiment.instrument && <span>Instrument: <strong className="text-gray-700">{experiment.instrument}</strong></span>}
          {experiment.project?.name && <span>Project: <strong className="text-gray-700">{experiment.project.name}</strong></span>}
        </div>

        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
          {stats.map(({ label, value, icon: Icon, bg, color }) => (
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

      {/* Inline upload panel */}
      {showUpload && (
        <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-gray-900 text-sm">Upload data to this experiment</h3>
            </div>
            <button onClick={() => { setShowUpload(false); setUploadFile(null); setUploadError(''); }}
              className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            onClick={() => uploadRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              uploadFile ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            }`}>
            <Upload className={`w-8 h-8 mx-auto mb-2 ${uploadFile ? 'text-blue-500' : 'text-gray-300'}`} />
            {uploadFile ? (
              <>
                <p className="font-medium text-gray-900 text-sm">{uploadFile.name}</p>
                <p className="text-gray-400 text-xs mt-1">{(uploadFile.size / 1024).toFixed(1)} KB — click to change</p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 font-medium">Click to select or drag & drop</p>
                <p className="text-xs text-gray-400 mt-1">CSV files only — auto-detects plate reader, FACS, and kinetic formats</p>
              </>
            )}
            <input ref={uploadRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); setUploadError(''); } }} />
          </div>

          {/* Expected format hint */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-700 mb-1.5">Expected CSV column headers (auto-detected):</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
              <span className="text-blue-700">Plate reader endpoint:</span>
              <span>Well, Sample_ID, Raw_Fluorescence_RFU</span>
              <span className="text-purple-700">FACS:</span>
              <span>Median_FAST_Fluorescence_AU, Sample_ID</span>
              <span className="text-green-700">Kinetic / thermal:</span>
              <span>Temperature_C, Time_min, Fluorescence_RFU</span>
              <span className="text-amber-700">Standard curve:</span>
              <span>Standard_Curve, Concentration_ug_mL</span>
            </div>
            <p className="text-gray-400 mt-1">Only .csv files are supported. XLSX must be exported to CSV first.</p>
          </div>

          {uploadError && (
            <div className="flex items-start gap-2 text-red-600 text-sm mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button onClick={handleInlineUpload} disabled={!uploadFile || uploading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />Parsing…</> : <><Upload className="w-4 h-4" />Upload File</>}
            </button>
          </div>
        </div>
      )}

      {/* Chart / table tabs */}
      {measurements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-1 px-5 pt-4 pb-0 border-b border-gray-100">
            {[
              { key: 'chart', label: 'Chart' },
              ...(hasWellData ? [{ key: 'plate', label: 'Plate View' }] : []),
              { key: 'table', label: `Table (${measurements.length})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === key ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {key === 'plate' && <Grid3X3 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'chart' && (
            <div className="p-5 space-y-6">
              {kinetic && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">
                    Fluorescence vs Time
                    {measurements.find(m => m.condition?.temperature) && ` at ${measurements.find(m => m.condition?.temperature).condition.temperature}°C`}
                  </h3>
                  <p className="text-xs text-gray-400 mb-4">Mean fluorescence (RFU) per variant over time. Decreasing signal = protein unfolding.</p>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={kinetic.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" label={{ value: 'Time (min)', position: 'insideBottom', offset: -2, fontSize: 11 }} tick={{ fontSize: 11 }} />
                      <YAxis label={{ value: 'Fluorescence (RFU)', angle: -90, position: 'insideLeft', fontSize: 11 }} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v, name) => [`${v} RFU`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      {kinetic.seriesKeys.map((key, i) => (
                        <Line key={key} type="monotone" dataKey={key} stroke={PALETTE[i % PALETTE.length]}
                          dot={false} strokeWidth={1.5} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>

                  {halfLifeRanking.length > 0 && (
                    <div className="mt-5">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Half-life ranking (top {halfLifeRanking.length})</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-left">
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Rank</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Sample</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">t½ (min)</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">R²</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {halfLifeRanking.map((row, i) => (
                              <tr key={i} className={i === 0 ? 'bg-green-50' : ''}>
                                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                                <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                                <td className="px-3 py-2 font-mono font-bold text-blue-700">{row.halfLife}</td>
                                <td className={`px-3 py-2 font-mono text-xs ${row.r2 >= 0.8 ? 'text-green-600' : 'text-amber-500'}`}>{row.r2}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!kinetic && endpointData.length > 0 && (
                <div>
                  {foldChangeData.length > 0 ? (
                    <>
                      <h3 className="font-semibold text-gray-900 mb-1">Fold Change vs WT Reference</h3>
                      <p className="text-xs text-gray-400 mb-4">Fluorescence normalised to WT_HSFAST_FUSION mean. Above 1.0 = more stable than WT.</p>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={foldChangeData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{ fontSize: 9 }} interval={0} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [`${v}×`, 'Fold change vs WT']} />
                          <Bar dataKey="foldChange" radius={[3, 3, 0, 0]}
                            fill="#10b981" />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <>
                      <h3 className="font-semibold text-gray-900 mb-1">Endpoint Fluorescence by Variant</h3>
                      <p className="text-xs text-gray-400 mb-4">Mean raw fluorescence (RFU). Run Analytics to normalise to WT reference.</p>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={endpointData.slice(0, 30)} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{ fontSize: 9 }} interval={0} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [`${v} RFU`, 'Mean Fluorescence']} />
                          <Bar dataKey="fluorescence" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      {endpointData.length > 30 && (
                        <p className="text-xs text-gray-400 text-center mt-2">Showing top 30 of {endpointData.length} variants</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {!hasChart && (
                <div className="py-10 text-center text-gray-400 text-sm">
                  No chart data available for this experiment type.
                </div>
              )}
            </div>
          )}

          {activeTab === 'plate' && (
            <div className="p-5">
              <h3 className="font-semibold text-gray-900 mb-1">Plate View — Endpoint Fluorescence</h3>
              <p className="text-xs text-gray-400 mb-4">
                Each well coloured by raw fluorescence intensity. Hover for sample ID and value.
                Outline colour indicates sample type.
              </p>
              <PlateHeatmap measurements={measurements} />
            </div>
          )}

          {activeTab === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Variant / Sample</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Well</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Readings</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Half-life (min)</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fold vs WT</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sample type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">QC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {measurements.map(m => {
                    const hl = m.derivedMetrics?.find(d => d.metricType === 'half_life');
                    const fc = m.derivedMetrics?.find(d => d.metricType === 'fold_change');
                    return (
                      <tr key={m._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          {m.variant ? (
                            <button onClick={() => navigate(`/variants/${m.variant._id}`)}
                              className="font-medium text-blue-600 hover:text-blue-700 text-sm text-left">
                              {m.variant.name}
                            </button>
                          ) : (
                            <span className="text-gray-700 text-sm">{m.replicateGroup?.split('_R')[0] || m.sampleType}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-600">{m.wellPosition || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {m.rawReadings?.length > 0 ? (
                            m.rawReadings.length === 1
                              ? `${m.rawReadings[0].fluorescence} ${m.rawReadings[0].unit}`
                              : `${m.rawReadings.length} pts`
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {hl ? (
                            <span className="font-mono text-gray-800">
                              {hl.value}
                              {hl.goodnessOfFit != null && (
                                <span className={`ml-1.5 text-xs ${hl.goodnessOfFit >= 0.8 ? 'text-green-500' : 'text-amber-500'}`}>
                                  R²={hl.goodnessOfFit}
                                </span>
                              )}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">
                          {fc ? (
                            <span className={fc.value >= 1.1 ? 'text-green-600 font-medium' : fc.value <= 0.9 ? 'text-red-500' : 'text-gray-600'}>
                              {fc.value}×
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            m.sampleType === 'POSITIVE_CONTROL' ? 'bg-green-100 text-green-700' :
                            m.sampleType === 'NEGATIVE_CONTROL' ? 'bg-red-100 text-red-700' :
                            m.sampleType === 'REFERENCE' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{m.sampleType}</span>
                        </td>
                        <td className="px-4 py-3">
                          <QcBadge flags={m.qcFlags} excluded={m.excluded} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {measurements.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No measurements yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Upload a .csv or .xlsx data file. The platform auto-detects plate reader, FACS, and kinetic formats.
          </p>
          <button onClick={() => { setShowUpload(true); setUploadFile(null); setUploadError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Upload Data
          </button>
        </div>
      )}
    </div>
  );
}
