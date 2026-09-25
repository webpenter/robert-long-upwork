import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Copy, Check, RotateCcw } from 'lucide-react';
import api from '../services/apiClient';

// Admin-only account management. Public sign-up is closed, so this is how every
// account is created. The server generates the first password and returns it
// exactly once; it is shown here until dismissed and never stored client-side.

const ROLES = [
  ['EXTERNAL_CUSTOMER',     'Customer'],
  ['INTERNAL_SCIENTIST',    'Scientist'],
  ['INTERNAL_PROJECT_LEAD', 'Project lead'],
  ['ADMIN',                 'Administrator'],
];
const ROLE_LABEL = Object.fromEntries(ROLES);
const TIERS = ['BRONZE', 'SILVER', 'GOLD'];

function CredentialNotice({ issued, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const text = `Email: ${issued.email}\nTemporary password: ${issued.password}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* clipboard blocked; the text is selectable */ }
  };
  return (
    <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-2">
      <p className="text-sm font-semibold text-green-800">{issued.title}</p>
      <pre className="text-sm font-mono text-green-900 bg-white border border-green-200 rounded px-3 py-2 select-all whitespace-pre-wrap">{text}</pre>
      <p className="text-xs text-green-700">
        Shown once. Send it to them privately; they can change it under Settings &rarr; Password.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={copy}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={onDismiss}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-green-300 text-green-800 hover:bg-green-100">
          Done
        </button>
      </div>
    </div>
  );
}

export default function UserAdmin({ currentUserId }) {
  const [users, setUsers]   = useState([]);
  const [error, setError]   = useState('');
  const [issued, setIssued] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [form, setForm]     = useState({ name: '', email: '', role: 'EXTERNAL_CUSTOMER', tier: 'BRONZE', institution: '' });

  const load = useCallback(async () => {
    try { setUsers((await api.get('/users')).users || []); }
    catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { user, temporaryPassword } = await api.post('/users', form);
      setIssued({ title: `Account created for ${user.name}`, email: user.email, password: temporaryPassword });
      setForm({ name: '', email: '', role: 'EXTERNAL_CUSTOMER', tier: 'BRONZE', institution: '' });
      load();
    } catch (err) {
      setError(err.body?.errors?.[0]?.msg || err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u) => {
    if (u.isActive && !window.confirm(`Disable ${u.name}? They will be signed out immediately.`)) return;
    try { await api.patch(`/users/${u._id}/active`, { isActive: !u.isActive }); load(); }
    catch (err) { setError(err.message); }
  };

  const resetPassword = async (u) => {
    if (!window.confirm(`Issue a new temporary password for ${u.name}? Their current password stops working.`)) return;
    try {
      const { temporaryPassword } = await api.post(`/users/${u._id}/reset-password`, {});
      setIssued({ title: `New temporary password for ${u.name}`, email: u.email, password: temporaryPassword });
    } catch (err) { setError(err.message); }
  };

  const changeTier = async (u, tier) => {
    try { await api.patch(`/users/${u._id}/tier`, { tier }); load(); }
    catch (err) { setError(err.message); }
  };

  const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-5 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
          <Users className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Users</h3>
          <p className="text-xs text-gray-500">Access is by invitation. Only administrators can create accounts.</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {issued && <CredentialNotice issued={issued} onDismiss={() => setIssued(null)} />}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <form onSubmit={create} className="space-y-3">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><UserPlus className="w-4 h-4 text-gray-400" /> Add a user</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Full name" value={form.name} onChange={set('name')} className={input} />
            <input required type="email" placeholder="Email" value={form.email} onChange={set('email')} className={input} />
            <input placeholder="Institution (optional)" value={form.institution} onChange={set('institution')} className={input} />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.role} onChange={set('role')} className={input}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={form.tier} onChange={set('tier')} className={input}>
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-y border-gray-100 bg-gray-50">
                {['User', 'Tier', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => {
                const self = String(u._id) === String(currentUserId);
                return (
                  <tr key={u._id} className={u.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-2.5 min-w-0">
                      <div className="font-medium text-gray-900">{u.name}{self && <span className="text-xs text-gray-400"> (you)</span>}</div>
                      <div className="text-xs text-gray-500 break-all">{u.email}</div>
                      <div className="text-xs text-gray-400">{ROLE_LABEL[u.role] || u.role}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={u.tier} onChange={e => changeTier(u, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-1.5 py-1">
                        {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => resetPassword(u)} title="Issue a new temporary password"
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      {!self && (
                        <button type="button" onClick={() => toggleActive(u)}
                          className={`ml-1 text-xs font-medium px-2.5 py-1 rounded-md border ${u.isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                          {u.isActive ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
