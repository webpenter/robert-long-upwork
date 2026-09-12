const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getTokens() {
  return {
    access: localStorage.getItem('enzml_access_token'),
    refresh: localStorage.getItem('enzml_refresh_token'),
  };
}

function saveTokens(accessToken, refreshToken) {
  localStorage.setItem('enzml_access_token', accessToken);
  if (refreshToken) localStorage.setItem('enzml_refresh_token', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('enzml_access_token');
  localStorage.removeItem('enzml_refresh_token');
}

let isRefreshing = false;
let refreshQueue = [];

async function refreshAccessToken({ silent = false } = {}) {
  const { refresh } = getTokens();
  if (!refresh) throw new Error('No refresh token');

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!res.ok) {
    clearTokens();
    // Forcing a hard navigation here is right when a genuine mid-session call
    // expires (the user is looking at an authenticated page that just broke),
    // but wrong for a passive "is there already a session?" check made on
    // every page load — including public ones. AuthContext's mount-time
    // restore passes silent:true so a stale token from a previous session
    // doesn't yank a visitor off a public route (e.g. the landing page) and
    // straight to /login before they've done anything.
    if (!silent) window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await res.json();
  saveTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function request(path, options = {}) {
  const { access } = getTokens();
  const { silent, ...fetchOptions } = options;

  const headers = {
    'Content-Type': 'application/json',
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
    ...fetchOptions.headers,
  };

  let res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers });

  // Auto-refresh on 401
  if (res.status === 401 && getTokens().refresh) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken({ silent });
        isRefreshing = false;
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        res = await fetch(`${BASE_URL}${path}`, {
          ...fetchOptions,
          headers: { ...headers, Authorization: `Bearer ${newToken}` },
        });
      } catch (err) {
        isRefreshing = false;
        refreshQueue = [];
        throw err;
      }
    } else {
      // Wait for ongoing refresh
      const newToken = await new Promise((resolve) => refreshQueue.push(resolve));
      res = await fetch(`${BASE_URL}${path}`, {
        ...fetchOptions,
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
      });
    }
  }

  const contentType = res.headers.get('content-type');
  const body = contentType?.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = body?.error || body?.errors?.[0]?.msg || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

const api = {
  get: (path, opts) => request(path, { method: 'GET', ...opts }),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  saveTokens,
  clearTokens,
  getTokens,
};

export default api;
