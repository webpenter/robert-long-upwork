import { useLocation } from 'react-router-dom';
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
    : TITLES[location.pathname] || 'EnduraFAST';

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
