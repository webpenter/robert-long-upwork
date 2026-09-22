import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, AlertTriangle, WifiOff, Check } from 'lucide-react';
import api from '../services/apiClient';

// There is no notifications collection in the backend. Everything here is
// derived from data the app already exposes: recently finished predictions
// (/predictions) and whether the ML service is reachable (/ml/info). "Read"
// state is a last-seen timestamp kept per browser, since nothing server-side
// tracks it.

const SEEN_KEY   = 'enzml_notif_seen';
const POLL_MS    = 30_000;
const WINDOW_MS  = 7 * 24 * 60 * 60 * 1000;   // show the last 7 days of activity

function readSeen() {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
}
function writeSeen(ts) {
  try { localStorage.setItem(SEEN_KEY, String(ts)); } catch { /* storage unavailable */ }
}

function seqName(fasta) {
  const first = (fasta || '').split('\n')[0] || '';
  return first.startsWith('>') ? first.slice(1).trim().slice(0, 40) : 'Sequence';
}

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60)      return 'just now';
  if (s < 3600)    return `${Math.floor(s / 60)} min ago`;
  if (s < 86400)   return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export default function NotificationBell() {
  const [items, setItems]   = useState([]);
  const [open, setOpen]     = useState(false);
  const [seen, setSeen]     = useState(readSeen);
  const rootRef             = useRef(null);
  const navigate            = useNavigate();

  const load = useCallback(async () => {
    const cutoff = Date.now() - WINDOW_MS;
    const next = [];

    // ML service reachability — a 503 from the proxy means offline.
    const mlOk = await api.get('/ml/info', { silent: true }).then(() => true).catch(() => false);
    if (!mlOk) {
      next.push({
        id: 'ml-offline', kind: 'warn', ts: Date.now(),
        title: 'ML service unreachable',
        body: 'New predictions will use the offline fallback until it is back.',
      });
    }

    try {
      const { predictions } = await api.get('/predictions', { silent: true });
      for (const p of predictions || []) {
        if (p.status !== 'COMPLETED' && p.status !== 'FAILED') continue;
        const ts = new Date(p.completedAt || p.updatedAt || p.createdAt).getTime();
        if (!ts || ts < cutoff) continue;
        const ok = p.status === 'COMPLETED';
        next.push({
          id: p._id, kind: ok ? 'ok' : 'fail', ts, to: `/results/${p._id}`,
          title: ok ? 'Prediction complete' : 'Prediction failed',
          body: ok
            ? `${seqName(p.fastaSequence)} · ΔG ${p.dG != null ? (p.dG >= 0 ? '+' : '') + p.dG.toFixed(2) : '—'} kcal/mol`
            : `${seqName(p.fastaSequence)} · ${p.errorMessage || 'see details'}`,
        });
      }
    } catch { /* not signed in yet, or transient — leave the list as it was */ }

    next.sort((a, b) => b.ts - a.ts);
    setItems(next.slice(0, 20));
  }, []);

  // Poll, and refresh when the tab regains focus so a prediction that finished
  // while the user was elsewhere shows up immediately.
  useEffect(() => {
    const initial = setTimeout(load, 0);   // first fetch after mount, not during render commit
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const unread = items.filter(i => i.ts > seen).length;

  const markAllRead = () => { const now = Date.now(); writeSeen(now); setSeen(now); };

  const openItem = (item) => {
    setOpen(false);
    if (item.to) navigate(item.to);
  };

  const ICON = {
    ok:   <CheckCircle2  className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />,
    fail: <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />,
    warn: <WifiOff       className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No recent activity</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {items.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${item.ts > seen ? 'bg-blue-50/40' : ''}`}
                  >
                    {ICON[item.kind]}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{item.title}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(item.ts)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{item.body}</p>
                    </div>
                    {item.ts > seen && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
