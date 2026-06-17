import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dna, Loader2, AlertCircle, ArrowUpDown } from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import api from '../services/apiClient';

// ── Colour scale: red → white → green, normalised by max absolute delta ───────
function deltaColor(delta, maxAbs) {
  if (delta == null || maxAbs === 0) return '#e2e8f0';
  const t = Math.max(-1, Math.min(1, delta / maxAbs)); // -1..+1
  if (t >= 0) {
    // white → green
    const r = Math.round(255 - t * (255 - 16));
    const g = Math.round(255 - t * (255 - 185));
    const b = Math.round(255 - t * (255 - 129));
    return `rgb(${r},${g},${b})`;
  } else {
    // white → red
    const abs = -t;
    const r = 255;
    const g = Math.round(255 - abs * (255 - 77));
    const b = Math.round(255 - abs * (255 - 77));
    return `rgb(${r},${g},${b})`;
  }
}

const SORT_OPTIONS = [
  { key: 'position', label: 'Position' },
  { key: 'bestDelta', label: 'Best Δ half-life' },
  { key: 'mutationCount', label: 'Mutation count' },
];

export default function MutationView() {
  const navigate = useNavigate();
  const [projects,   setProjects]   = useState([]);
  const [projectId,  setProjectId]  = useState('');
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [hovered,    setHovered]    = useState(null);   // { position, mutation }
  const [selected,   setSelected]   = useState(null);   // pinned position
  const [sortBy,     setSortBy]     = useState('bestDelta');
  const [sortDir,    setSortDir]    = useState('desc');

  useEffect(() => {
    api.get('/projects').then(({ projects: p }) => {
      setProjects(p || []);
      if (p?.length > 0) setProjectId(p[0]._id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    setData(null);
    setSelected(null);
    api.get(`/analytics/mutations/${projectId}`)
      .then(d => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const maxAbs = useMemo(() => {
    if (!data?.positions) return 1;
    const deltas = data.positions.flatMap(p => p.mutations.map(m => m.deltaHalfLife)).filter(d => d != null);
    return deltas.length ? Math.max(...deltas.map(Math.abs), 0.01) : 1;
  }, [data]);

  const sortedPositions = useMemo(() => {
    if (!data?.positions) return [];
    return [...data.positions].sort((a, b) => {
      let va = a[sortBy], vb = b[sortBy];
      if (sortBy === 'bestDelta') { va = va ?? -Infinity; vb = vb ?? -Infinity; }
      if (sortBy === 'position' || sortBy === 'mutationCount') { va = va ?? 0; vb = vb ?? 0; }
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [data, sortBy, sortDir]);

  // Bar chart data: top/bottom 20 positions by bestDelta
  const barData = useMemo(() => {
    if (!data?.positions) return [];
    return [...data.positions]
      .filter(p => p.bestDelta != null)
      .sort((a, b) => b.bestDelta - a.bestDelta)
      .slice(0, 20)
      .map(p => ({
        label: `${p.fromAa}${p.position}`,
        delta: p.bestDelta,
        position: p.position,
      }));
  }, [data]);

  const activePos = selected ?? hovered?.position ?? null;
  const activeData = activePos != null ? data?.positions?.find(p => p.position === activePos) : null;

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const BarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs space-y-1">
        <p className="font-semibold text-gray-900">Position {d.position}</p>
        <p className={`font-mono font-bold ${d.delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          Δt½ = {d.delta > 0 ? '+' : ''}{d.delta} min
        </p>
        {data?.wtHalfLife && (
          <p className="text-gray-400">WT ref: {data.wtHalfLife} min</p>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Dna className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Residue Mutation Analysis</h2>
              <p className="text-sm text-gray-500">
                Stability effect per sequence position — green = stabilising, red = destabilising
                {data?.wtHalfLife && <span className="ml-2 text-gray-400">(WT ref: {data.wtHalfLife} min)</span>}
              </p>
            </div>
          </div>

          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm p-4 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Aggregating mutation data…</span>
        </div>
      )}

      {!loading && data && data.positions.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <Dna className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No mutation data for this project</p>
          <p className="text-gray-400 text-sm mt-1">
            Variants need single-point mutations recorded and at least one analytics run.
          </p>
        </div>
      )}

      {!loading && data && data.positions.length > 0 && (
        <>
          {/* Sequence heatmap */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-1">Sequence Position Heatmap</h3>
            <p className="text-xs text-gray-400 mb-4">
              Each cell = one mutation at that position. Colour = Δ half-life vs WT reference.
              Click to pin details.
            </p>

            <div className="overflow-x-auto">
              <div className="flex flex-wrap gap-1 pb-1" style={{ minWidth: data.positions.length * 28 }}>
                {data.positions.map(p => {
                  const isPinned  = selected === p.position;
                  const isHovered = hovered?.position === p.position;
                  return (
                    <div key={p.position} className="flex flex-col items-center gap-0.5">
                      {p.mutations.map((mut, i) => (
                        <div
                          key={i}
                          className={`w-6 h-6 rounded text-center text-xs font-mono font-bold leading-6 cursor-pointer transition-all
                            ${isPinned || isHovered ? 'ring-2 ring-offset-1 ring-blue-500 scale-110 z-10' : 'hover:scale-110'}`}
                          style={{ backgroundColor: deltaColor(mut.deltaHalfLife, maxAbs), color: Math.abs(mut.deltaHalfLife ?? 0) > maxAbs * 0.4 ? '#fff' : '#374151' }}
                          title={`${mut.notation} — Δt½ ${mut.deltaHalfLife != null ? (mut.deltaHalfLife > 0 ? '+' : '') + mut.deltaHalfLife : '?'} min`}
                          onMouseEnter={() => setHovered({ position: p.position, notation: mut.notation })}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => setSelected(s => s === p.position ? null : p.position)}
                        >
                          {mut.to}
                        </div>
                      ))}
                      <div className="text-gray-400" style={{ fontSize: 9, writingMode: 'horizontal-tb' }}>
                        {p.position}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Color scale legend */}
            <div className="flex items-center gap-3 mt-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-20 h-3 rounded" style={{ background: 'linear-gradient(to right, #ef4444, #f9fafb, #10b981)' }} />
              </div>
              <span className="text-red-500 font-medium">Destabilising</span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-400">Neutral</span>
              <span className="text-gray-300">|</span>
              <span className="text-green-600 font-medium">Stabilising</span>
              {data.wtHalfLife && (
                <span className="ml-4 text-gray-400">WT t½ = {data.wtHalfLife} min (reference)</span>
              )}
            </div>
          </div>

          {/* Detail panel + bar chart row */}
          <div className="grid grid-cols-12 gap-5">

            {/* Detail panel */}
            <div className={`${activeData ? 'col-span-4' : 'col-span-0 hidden'} bg-white rounded-xl shadow-sm border border-blue-100 p-5 transition-all`}>
              {activeData && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900 text-sm">
                      Position <span className="text-blue-700">{activeData.position}</span>
                      <span className="ml-2 text-gray-400 font-normal">({activeData.fromAa} → …)</span>
                    </h4>
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                  </div>

                  <div className="space-y-2">
                    {activeData.mutations.map((mut, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-gray-100"
                        style={{ borderLeftColor: deltaColor(mut.deltaHalfLife, maxAbs), borderLeftWidth: 3 }}>
                        <div>
                          <div className="font-mono font-bold text-sm text-gray-900">{mut.notation}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{mut.variantName} · n={mut.n}</div>
                        </div>
                        <div className="text-right">
                          {mut.deltaHalfLife != null && (
                            <div className={`font-mono font-bold text-sm ${mut.deltaHalfLife >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {mut.deltaHalfLife > 0 ? '+' : ''}{mut.deltaHalfLife} min
                            </div>
                          )}
                          {mut.meanHalfLife != null && (
                            <div className="text-xs text-gray-400">t½ = {mut.meanHalfLife} min</div>
                          )}
                          {mut.meanFoldChange != null && (
                            <div className="text-xs text-gray-400">{mut.meanFoldChange}× WT</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Bar chart: top 20 positions by Δ half-life */}
            <div className={`${activeData ? 'col-span-8' : 'col-span-12'} bg-white rounded-xl shadow-sm border border-gray-100 p-5`}>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">
                Top 20 Positions by Best Δ Half-life
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Best stabilising mutation at each position vs WT reference. Click a bar to see all substitutions at that position.
              </p>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} unit=" min" />
                    <Tooltip content={<BarTooltip />} />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
                    <Bar dataKey="delta" radius={[3, 3, 0, 0]}
                      onClick={d => setSelected(s => s === d.position ? null : d.position)}>
                      {barData.map((entry, i) => (
                        <Cell key={i}
                          fill={deltaColor(entry.delta, maxAbs)}
                          stroke={selected === entry.position ? '#3b82f6' : 'transparent'}
                          strokeWidth={2}
                          cursor="pointer" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-10 text-center text-gray-300 text-sm">
                  Run Analytics on experiments first to populate half-life values.
                </div>
              )}
            </div>
          </div>

          {/* Sortable table of all positions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">All Positions ({data.positions.length})</h3>
              <div className="flex items-center gap-2">
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.key}
                    onClick={() => toggleSort(opt.key)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      sortBy === opt.key ? 'bg-teal-50 border-teal-200 text-teal-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {opt.label}
                    {sortBy === opt.key && <ArrowUpDown className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Position</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">WT Residue</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Substitutions</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Best Δ t½ (min)</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mean t½ (min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedPositions.map(p => (
                    <tr key={p.position}
                      onClick={() => setSelected(s => s === p.position ? null : p.position)}
                      className={`cursor-pointer transition-colors ${selected === p.position ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3 font-mono font-bold text-gray-900">{p.position}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{p.fromAa}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {p.mutations.map((m, i) => (
                            <span key={i}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold"
                              style={{
                                backgroundColor: deltaColor(m.deltaHalfLife, maxAbs),
                                color: Math.abs(m.deltaHalfLife ?? 0) > maxAbs * 0.4 ? '#fff' : '#374151',
                              }}>
                              {m.notation}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {p.bestDelta != null ? (
                          <span className={`font-bold text-sm ${p.bestDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {p.bestDelta > 0 ? '+' : ''}{p.bestDelta}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700 text-sm">
                        {p.meanHalfLife != null ? p.meanHalfLife : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
