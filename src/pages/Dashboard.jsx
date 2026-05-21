import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, FlaskConical, Activity, TrendingUp, Plus, ChevronRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

function StatCard({ label, value, icon: Icon, bgColor, textColor }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function RiskBadge({ risk }) {
  if (risk === 'Low') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Low</span>;
  if (risk === 'Medium') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Medium</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">High</span>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { projects, predictions } = useApp();
  const navigate = useNavigate();

  const totalMutations = predictions.reduce((s, p) => s + (p.mutations?.length || 0), 0);
  const avgConf = predictions.length > 0
    ? Math.round(predictions.reduce((s, p) => {
        const avg = p.mutations?.reduce((ms, m) => ms + m.confidence, 0) / (p.mutations?.length || 1);
        return s + avg;
      }, 0) / predictions.length * 100)
    : 0;

  const stats = [
    { label: 'Total Projects', value: projects.length, icon: FolderOpen, bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
    { label: 'Predictions Run', value: predictions.length, icon: FlaskConical, bgColor: 'bg-purple-50', textColor: 'text-purple-600' },
    { label: 'Mutations Analyzed', value: totalMutations, icon: Activity, bgColor: 'bg-teal-50', textColor: 'text-teal-600' },
    { label: 'Avg Confidence', value: predictions.length ? `${avgConf}%` : '—', icon: TrendingUp, bgColor: 'bg-green-50', textColor: 'text-green-600' },
  ];

  const firstName = user?.name?.split(' ').find(n => n.startsWith('Dr.') ? false : true) || user?.name?.split(' ')[0] || 'there';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome back{user?.name?.startsWith('Dr.') ? `, ${user.name}` : `, ${firstName}`}
          </h2>
          <p className="text-gray-500 text-sm mt-1">Here's an overview of your research workspace</p>
        </div>
        <button onClick={() => navigate('/predict')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          New Prediction
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Projects */}
        <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Projects</h3>
            <button onClick={() => navigate('/predict')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {projects.map(project => (
              <div key={project.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => navigate('/predict')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{project.name}</div>
                    <div className="text-gray-400 text-xs mt-0.5 truncate">{project.description}</div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">
                    {project.predictionCount} runs
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Predictions */}
        <div className="col-span-3 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Recent Predictions</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {predictions.slice(0, 6).map(pred => {
              const topMutation = pred.mutations?.[0];
              return (
                <div key={pred.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/results/${pred.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">{pred.header}</div>
                      <div className="text-gray-400 text-xs mt-0.5">
                        T={pred.conditions?.temperature}°C · pH={pred.conditions?.ph} ·{' '}
                        {pred.mutations?.length} mutations · {new Date(pred.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {topMutation && (
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {(topMutation.stabilityScore * 100).toFixed(0)}%
                        </div>
                        <RiskBadge risk={topMutation.activityRisk} />
                      </div>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </div>
                </div>
              );
            })}
            {predictions.length === 0 && (
              <div className="p-8 text-center">
                <FlaskConical className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No predictions yet</p>
                <button onClick={() => navigate('/predict')} className="mt-3 text-blue-600 text-sm font-medium hover:text-blue-700">
                  Run your first prediction
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
