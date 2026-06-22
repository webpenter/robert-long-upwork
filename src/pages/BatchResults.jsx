import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, ExternalLink } from 'lucide-react';
import api from '../services/apiClient';

// Colour by sign — client convention: negative ΔG = more stable.
function dgColor(dg) {
  if (dg == null) return '#6b7280';
  if (dg <= -0.5) return '#16a34a';
  if (dg >=  0.5) return '#dc2626';
  return '#ca8a04';
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

  const exportCSV = () => {
    const header = 'name,dG_kcal_mol,seq_len,status,model_version,id\n';
    const body = sorted.map(p =>
      [JSON.stringify(name(p)), p.dG ?? '', p.seqLen ?? '', p.status, p.modelVersion ?? '', p._id].join(',')
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'batch_predictions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
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
          {' · '}sorted by stability (most stable first) · negative ΔG = more stable
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sequence</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Length</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">ΔG (kcal/mol)</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((p, i) => (
              <tr key={p._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate" title={name(p)}>{name(p)}</td>
                <td className="px-4 py-3 text-gray-500">{p.seqLen ?? '—'}</td>
                <td className="px-4 py-3 font-mono font-semibold" style={{ color: dgColor(p.dG) }}>
                  {p.dG != null ? `${p.dG >= 0 ? '+' : ''}${p.dG.toFixed(2)}` : '—'}
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
            ))}
            {!sorted.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading predictions…
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
