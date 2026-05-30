import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BarChart3, Calendar, User, FlaskConical, Upload, ChevronRight, Search } from 'lucide-react';
import api from '../services/apiClient';

const ASSAY_COLORS = {
  THERMAL: 'bg-red-100 text-red-700',
  PH: 'bg-blue-100 text-blue-700',
  SOLVENT: 'bg-purple-100 text-purple-700',
  IONIC_STRENGTH: 'bg-green-100 text-green-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

export default function Experiments() {
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/experiments')
      .then(({ experiments }) => setExperiments(experiments))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = experiments.filter(e =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.operator?.toLowerCase().includes(search.toLowerCase()) ||
    e.instrument?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Experiments</h2>
          <p className="text-gray-500 text-sm mt-1">All hsFAST stability assay runs</p>
        </div>
        <button onClick={() => navigate('/experiments/new')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm">
          <Upload className="w-4 h-4" />
          Upload New Run
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search experiments..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading experiments...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No experiments yet</p>
          <p className="text-gray-400 text-sm mt-1">Upload your first plate reader or FACS data file</p>
          <button onClick={() => navigate('/experiments/new')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Upload Data
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Experiment</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Operator</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Instrument</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(exp => (
                <tr key={exp._id} onClick={() => navigate(`/experiments/${exp._id}`)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900 text-sm">{exp.name}</div>
                    {exp.notes && <div className="text-gray-400 text-xs mt-0.5 truncate max-w-xs">{exp.notes}</div>}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${ASSAY_COLORS[exp.assayType] || ASSAY_COLORS.OTHER}`}>
                      {exp.assayType}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {exp.date ? new Date(exp.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{exp.operator || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{exp.instrument || '—'}</td>
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
