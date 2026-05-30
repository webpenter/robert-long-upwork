import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from stored token
  useEffect(() => {
    const { access } = api.getTokens();
    if (!access) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => api.clearTokens())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { user, accessToken, refreshToken } = await api.post('/auth/login', { email, password });
    api.saveTokens(accessToken, refreshToken);
    setUser(user);
    return user;
  };

  const register = async (name, email, password) => {
    const { user, accessToken, refreshToken } = await api.post('/auth/register', { name, email, password });
    api.saveTokens(accessToken, refreshToken);
    setUser(user);
    return user;
  };

  const logout = async () => {
    const { refresh } = api.getTokens();
    try { await api.post('/auth/logout', { refreshToken: refresh }); } catch {}
    api.clearTokens();
    setUser(null);
  };

  const updateUser = async (updates) => {
    const { user: updated } = await api.patch('/users/me', updates);
    setUser(updated);
    return updated;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
