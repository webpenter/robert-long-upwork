import { Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/predict': 'New Prediction',
  '/settings': 'Settings',
};

export default function Header() {
  const location = useLocation();
  const title = location.pathname.startsWith('/results')
    ? 'Prediction Results'
    : TITLES[location.pathname] || 'StrataBio Stability Platform';

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            title="Open the home page"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
