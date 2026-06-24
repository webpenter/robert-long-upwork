import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FlaskConical, Settings, LogOut, Upload, Dna, BarChart3, Brain, GitCompare, Microscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const isAdmin = user?.role === 'ADMIN';

  const tierColor = user?.tier === 'GOLD' ? 'text-yellow-400' : user?.tier === 'SILVER' ? 'text-slate-300' : 'text-orange-400';

  const NAV_SECTIONS = [
    {
      label: 'Overview',
      items: [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      ],
    },
    {
      label: 'Data Analysis',
      items: [
        { to: '/experiments', icon: BarChart3, label: 'Experiments', end: true },
        { to: '/variants', icon: Dna, label: 'Variants' },
        { to: '/compare', icon: GitCompare, label: 'Compare' },
        { to: '/mutations', icon: Microscope, label: 'Mutations' },
        { to: '/experiments/new', icon: Upload, label: 'Upload Data' },
      ],
    },
    {
      label: 'ML Predictions',
      items: [
        { to: '/predict', icon: FlaskConical, label: 'New Prediction' },
        ...(isAdmin ? [{ to: '/model', icon: Brain, label: 'Model Manager' }] : []),
      ],
    },
    {
      label: 'Account',
      items: [
        { to: '/settings', icon: Settings, label: 'Settings' },
      ],
    },
  ];

  return (
    <div className="w-64 bg-slate-900 flex flex-col flex-shrink-0 h-full">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-none">hsFAST</div>
            <div className="text-slate-400 text-xs mt-1">Stability Platform</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="px-3 pt-4 flex-1 overflow-y-auto space-y-4">
        {NAV_SECTIONS.map(({ label, items }) => (
          <div key={label}>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider px-3 mb-1">{label}</p>
            <nav className="space-y-0.5">
              {items.map(({ to, icon: Icon, label: itemLabel, end }) => (
                <NavLink key={to} to={to} end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {itemLabel}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
      </div>

      {/* User */}
      <div className="p-4 border-t border-slate-700 mt-auto">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{user?.name}</div>
            <div className={`text-xs font-semibold ${tierColor}`}>{user?.tier || 'BRONZE'}</div>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm w-full px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
