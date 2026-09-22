import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, LogOut, Brain, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ROLE_LABEL = {
  ADMIN:                 'Administrator',
  INTERNAL_SCIENTIST:    'Scientist',
  INTERNAL_PROJECT_LEAD: 'Project lead',
  EXTERNAL_CUSTOMER:     'Customer',
};

const TIER_CLASS = {
  GOLD:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  SILVER: 'bg-slate-50 text-slate-600 border-slate-200',
  BRONZE: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen]  = useState(false);
  const rootRef          = useRef(null);
  const navigate         = useNavigate();

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const isAdmin  = user?.role === 'ADMIN';

  // Close on outside click / Escape — same behaviour as the notification bell.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (to) => { setOpen(false); navigate(to); };
  const handleLogout = async () => { setOpen(false); await logout(); navigate('/login'); };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full hover:bg-gray-100 pr-1.5 transition-colors"
      >
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-900 truncate">{user?.name}</div>
            <div className="text-xs text-gray-500 truncate">{user?.email}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-gray-500">{ROLE_LABEL[user?.role] || user?.role}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TIER_CLASS[user?.tier] || TIER_CLASS.BRONZE}`}>
                {user?.tier || 'BRONZE'}
              </span>
              {user?.institution && (
                <span className="text-[11px] text-gray-400 truncate">· {user.institution}</span>
              )}
            </div>
          </div>

          <div className="py-1">
            <button type="button" onClick={() => go('/settings')}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <Settings className="w-4 h-4 text-gray-400" /> Settings
            </button>
            {isAdmin && (
              <button type="button" onClick={() => go('/model')}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Brain className="w-4 h-4 text-gray-400" /> Model Manager
              </button>
            )}
          </div>

          <div className="border-t border-gray-100 py-1">
            <button type="button" onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
