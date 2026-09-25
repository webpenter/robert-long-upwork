import { useState } from 'react';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import api from '../services/apiClient';

// Accounts are issued by an admin with a temporary password, so every user needs
// a way to replace it. The backend requires the current password (users.js).
export default function ChangePassword() {
  const [form, setForm]   = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone]   = useState(false);
  const [busy, setBusy]   = useState(false);

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setDone(false); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (form.next.length < 8)        return setError('New password must be at least 8 characters');
    if (form.next !== form.confirm)  return setError('New passwords do not match');
    setBusy(true);
    try {
      await api.patch('/users/me', { currentPassword: form.current, password: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-5 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
          <KeyRound className="w-4 h-4 text-blue-600" />
        </div>
        <h3 className="font-semibold text-gray-900">Password</h3>
      </div>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Current password</label>
          <input type="password" autoComplete="current-password" required value={form.current} onChange={set('current')} className={input} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
            <input type="password" autoComplete="new-password" required value={form.next} onChange={set('next')} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
            <input type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} className={input} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {busy ? 'Saving…' : 'Change password'}
          </button>
          {done && <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" /> Password changed</span>}
        </div>
      </form>
    </div>
  );
}
