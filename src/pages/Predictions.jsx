import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Zap, ChevronRight, Search, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ModelBadge, MixedModelWarning } from '../components/PredictionFlags';

const STATUS_STYLE = {
  COMPLETED: 'bg-green-100 text-green-700',
  RUNNING:   'bg-blue-100 text-blue-700',
  QUEUED:    'bg-amber-100 text-amber-700',
  FAILED:    'bg-red-100 text-red-700',
};

// Pull a readable label from the stored FASTA (its header line, else a preview).
function predictionName(fasta = '') {
  const header = fasta.split('\n').find(l => l.trim().startsWith('>'));
  if (header) return header.replace(/^>/, '').trim().slice(0, 60) || 'Untitled sequence';
  const seq = fasta.replace(/\s/g, '');
  return seq ? `${seq.slice(0, 24)}${seq.length > 24 ? '…' : ''}` : 'Untitled sequence';
}

export default function Predictions() {
  const navigate = useNavigate();
  const { predictions, predictionsLoaded, fetchPredictions } = useApp();
  const [loading, setLoading] = useState(!predictionsLoaded);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPredictions().catch(console.error).finally(() => setLoading(false));
  }, [fetchPredictions]);

  const filtered = predictions.filter(p => {
    const hay = `${p.fastaSequence || ''} ${p.stability || ''} ${p.modelVersion || ''}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Predictions</h2>
          <p className="text-gray-500 text-sm mt-1">Your saved stability predictions</p>
        </div>
        <button onClick={() => navigate('/predict')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm">
          <Zap className="w-4 h-4" />
          New Prediction
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search predictions..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading predictions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <FlaskConical className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No predictions yet</p>
          <p className="text-gray-400 text-sm mt-1">Run a stability prediction and it will be saved here</p>
          <button onClick={() => navigate('/predict')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            New Prediction
          </button>
        </div>
      ) : (
        <div className="space-y-4">
        <MixedModelWarning predictions={filtered} action="Comparing ΔG" />

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sequence</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">ΔG (kcal/mol)</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stability</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Model</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p._id} onClick={() => navigate(`/results/${p._id}`)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900 text-sm">{predictionName(p.fastaSequence)}</div>
                    {p.seqLen != null && <div className="text-gray-400 text-xs mt-0.5">{p.seqLen} aa</div>}
                  </td>
                  <td className="px-5 py-4 text-sm font-mono font-medium">
                    {p.dG != null
                      ? <span style={{ color: p.dG < 0 ? '#16a34a' : '#dc2626' }}>{p.dG > 0 ? '+' : ''}{p.dG.toFixed(2)}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600 capitalize">{p.stability || '—'}</td>
                  <td className="px-5 py-4">
                    <ModelBadge modelVersion={p.modelVersion} />
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLE[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </td>
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
