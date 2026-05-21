import { useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/predict': 'New Prediction',
  '/settings': 'Settings',
};

export default function Header() {
  const location = useLocation();
  const { user } = useAuth();
  const title = location.pathname.startsWith('/results')
    ? 'Prediction Results'
    : TITLES[location.pathname] || 'EnzymeML';
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <div className="flex items-center gap-3">
          <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
