import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dna, Search, ChevronRight } from 'lucide-react';
import api from '../services/apiClient';

export default function Variants() {
  const navigate = useNavigate();
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/variants')
      .then(({ variants }) => setVariants(variants))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = variants.filter(v =>
    v.name?.toLowerCase().includes(search.toLowerCase()) ||
    v.mutations?.some(m => m.notation?.toLowerCase().includes(search.toLowerCase())) ||
    v.familyAnnotation?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Variants</h2>
          <p className="text-gray-500 text-sm mt-1">All enzyme variants across projects</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search variants or mutations (e.g. A123V)..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading variants...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <Dna className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No variants yet</p>
          <p className="text-gray-400 text-sm mt-1">
            {search ? 'No variants match your search.' : 'Variants appear here once experiment data is uploaded.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Variant</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mutations</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Family</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Parent</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Structure</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(v => (
                <tr key={v._id} onClick={() => navigate(`/variants/${v._id}`)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900 text-sm">{v.name}</div>
                    {v.fastaSequence && (
                      <div className="text-gray-400 text-xs mt-0.5 font-mono truncate max-w-xs">
                        {v.fastaSequence.replace(/^>.*\n/, '').replace(/\s/g, '').slice(0, 32)}…
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {v.mutations?.length > 0 ? (
                        <>
                          {v.mutations.slice(0, 4).map((m, i) => (
                            <span key={i}
                              className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                              {m.notation || `${m.from}${m.position}${m.to}`}
                            </span>
                          ))}
                          {v.mutations.length > 4 && (
                            <span className="text-xs text-gray-400">+{v.mutations.length - 4} more</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 italic">WT / no mutations</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{v.familyAnnotation || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{v.parent?.name || <span className="text-gray-400 italic">WT</span>}</td>
                  <td className="px-5 py-4">
                    {v.structurePdbId ? (
                      <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-mono border border-teal-100">
                        {v.structurePdbId}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
