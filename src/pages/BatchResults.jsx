import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, ExternalLink, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import api from '../services/apiClient';
import { ConfidenceBadge, ModelBadge, MixedModelWarning } from '../components/PredictionFlags';
import { confidenceText } from '../services/confidence';
import { modelLabel } from '../services/modelLabel';

// Colour by sign — client convention: negative ΔG = more stable.
function dgColor(dg) {
  if (dg == null) return '#6b7280';
  if (dg <= -0.5) return '#16a34a';
  if (dg >=  0.5) return '#dc2626';
  return '#ca8a04';
}

// Y-axis label: sequence name, truncated. The axis plots by row id (unique, so
// two identically-named sequences never collide into one bar); this looks the
// display name back up from that id. Confidence is shown in the tooltip and the
// table rather than as a mark on the chart.
function RankedAxisTick({ x, y, payload, byId }) {
  const row = byId.get(payload.value);
  if (!row) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={4} textAnchor="end" fontSize="12" fill="#4b5563">
        {row.displayName}
      </text>
    </g>
  );
}

function RankedTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs max-w-[220px]">
      <p className="font-semibold text-gray-900 truncate">{d.fullName}</p>
      <p className="mt-1 text-gray-700">
        Rank <span className="font-semibold">#{d.rank}</span> &middot; ΔG{' '}
        <span className="font-mono font-semibold" style={{ color: dgColor(d.dG) }}>
          {d.dG >= 0 ? '+' : ''}{d.dG.toFixed(2)}
        </span> kcal/mol
      </p>
      {d.modelVersion && <p className="text-gray-400 mt-0.5 truncate">{modelLabel(d.modelVersion)}</p>}
      {d.confidence != null && (
        <p className="text-gray-500 mt-0.5">Confidence: {confidenceText(d.confidence)}</p>
      )}
    </div>
  );
}

export default function BatchResults() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = (params.get('ids') || '').split(',').filter(Boolean);

  const [rows, setRows] = useState([]);
  const timers = useRef([]);

  useEffect(() => {
    const poll = (id) => {
      api.get(`/predictions/${id}`)
        .then(({ prediction }) => {
          setRows(prev => {
            const next = prev.filter(p => p._id !== prediction._id);
            return [...next, prediction];
          });
          if (prediction.status === 'QUEUED' || prediction.status === 'RUNNING') {
            const t = setTimeout(() => poll(id), 2000);
            timers.current.push(t);
          }
        })
        .catch(() => {});
    };
    ids.forEach(poll);
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const ordered = ids
    .map(id => rows.find(r => r._id === id))
    .filter(Boolean);
  const done = ordered.filter(r => r.status === 'COMPLETED' || r.status === 'FAILED').length;
  const allDone = ordered.length === ids.length && done === ids.length;

  // Most stable first (lowest ΔG), completed rows before pending.
  const sorted = [...ordered].sort((a, b) => {
    const av = a.dG ?? Infinity, bv = b.dG ?? Infinity;
    return av - bv;
  });

  const name = (p) => p.fastaSequence?.split('\n')[0]?.replace('>', '').trim() || `Prediction ${String(p._id).slice(-6)}`;

  // Chart mirrors the table's own rank order exactly — same rows, same order,
  // just a second, faster-to-scan view of it. Only completed rows with a real
  // ΔG plot; pending/failed ones have nothing to show yet. The row's own id
  // becomes the category key (unique by construction) so two sequences that
  // happen to share a header never collide into one bar; RankedAxisTick still
  // displays the human-readable, truncated name.
  const chartRows = sorted.filter(p => p.dG != null);
  const chartData = useMemo(() => chartRows.map((p, i) => ({
    id: p._id,
    displayName: name(p).length > 22 ? `${name(p).slice(0, 21)}…` : name(p),
    fullName: name(p),
    dG: p.dG,
    rank: i + 1,
    modelVersion: p.modelVersion,
    confidence: p.confidence,
  })), [chartRows]);
  const chartById = useMemo(() => new Map(chartData.map(d => [d.id, d])), [chartData]);
  // ~34px per bar reads clearly without feeling sparse; capped so a very large
  // batch scrolls inside its own card rather than stretching the whole page.
  const chartHeight = Math.min(560, Math.max(140, chartData.length * 34 + 40));

  // Rank is the primary output — only completed rows hold a place in the ordering,
  // so a pending or failed sequence never occupies a rank it hasn't earned.
  const rankOf = (p) => {
    const done = sorted.filter(r => r.dG != null);
    const i = done.indexOf(p);
    return i === -1 ? null : i + 1;
  };

  const exportCSV = () => {
    const header = 'rank,name,dG_kcal_mol,seq_len,confidence,model_version,status,id\n';
    const body = sorted.map(p =>
      [rankOf(p) ?? '', JSON.stringify(name(p)), p.dG ?? '', p.seqLen ?? '',
       p.confidence ?? '',
       modelLabel(p.modelVersion), p.status, p._id].join(',')
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'batch_predictions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/predict')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
          <ArrowLeft className="w-4 h-4" /> New Prediction
        </button>
        <button onClick={exportCSV} disabled={!sorted.length}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Batch Results</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          {allDone ? `${ids.length} sequences predicted` : `Predicting… ${done} / ${ids.length} complete`}
          {' · '}<span className="font-medium text-gray-500">ranked most stable first</span>
          {' · '}negative ΔG = more stable
        </p>
      </div>

      <MixedModelWarning predictions={sorted} action="Ranking" />

      {chartData.length >= 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-sm">Ranked ΔG</h3>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Most stable at top. Green = stable, red = unstable, amber = borderline.
          </p>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              {/* Always include 0: every bar grows from zero, so an axis that
                  starts at, say, -15 (every value negative) draws no bars at all. */}
              <XAxis type="number" dataKey="dG" tick={{ fontSize: 11, fill: '#9ca3af' }}
                domain={[min => Math.floor(Math.min(0, min)), max => Math.ceil(Math.max(0, max))]}
                label={{ value: '← more stable   ΔG (kcal/mol)   less stable →', position: 'insideBottom', offset: -2, style: { fontSize: 10.5, fill: '#9ca3af' } }} />
              <YAxis type="category" dataKey="id" width={150}
                tick={<RankedAxisTick byId={chartById} />} />
              <ReferenceLine x={0} stroke="#d1d5db" />
              <Tooltip content={<RankedTooltip />} cursor={{ fill: '#f9fafb' }} />
              <Bar dataKey="dG" radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false}>
                {chartData.map(d => (
                  <Cell key={d.id} fill={dgColor(d.dG)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sequence</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Length</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">ΔG (kcal/mol)</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Confidence</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Model</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((p) => {
              const rank = rankOf(p);
              return (
              <tr key={p._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {rank == null
                    ? <span className="text-gray-300">—</span>
                    : <span className={`inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-lg text-sm font-bold ${
                        rank <= 3 ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                        {rank}
                      </span>}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate" title={name(p)}>{name(p)}</td>
                <td className="px-4 py-3 text-gray-500">{p.seqLen ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold" style={{ color: dgColor(p.dG) }}>
                      {p.dG != null ? `${p.dG >= 0 ? '+' : ''}${p.dG.toFixed(2)}` : '—'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ConfidenceBadge confidence={p.confidence} dashWhenMissing />
                </td>
                <td className="px-4 py-3">
                  <ModelBadge modelVersion={p.modelVersion} />
                </td>
                <td className="px-4 py-3">
                  {p.status === 'COMPLETED'
                    ? <span className="text-green-600 text-xs font-medium">Completed</span>
                    : p.status === 'FAILED'
                      ? <span className="text-red-500 text-xs font-medium" title={p.errorMessage}>Failed</span>
                      : <span className="flex items-center gap-1 text-gray-400 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> {p.status?.toLowerCase()}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/results/${p._id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">
                    View <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
              );
            })}
            {!sorted.length && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading predictions…
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
