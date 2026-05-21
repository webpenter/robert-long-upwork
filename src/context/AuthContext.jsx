import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('enzml_user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    setLoading(false);
  }, []);

  const login = (email, password) => {
    const users = JSON.parse(localStorage.getItem('enzml_users') || '[]');
    const found = users.find(u => u.email === email && u.password === password);
    if (!found) throw new Error('Invalid email or password');
    const { password: _pw, ...userData } = found;
    setUser(userData);
    localStorage.setItem('enzml_user', JSON.stringify(userData));
    return userData;
  };

  const register = (name, email, password) => {
    const users = JSON.parse(localStorage.getItem('enzml_users') || '[]');
    if (users.find(u => u.email === email)) throw new Error('Email already registered');
    const newUser = {
      id: `user_${Date.now()}`, name, email, password,
      role: 'Scientist', institution: '', createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    localStorage.setItem('enzml_users', JSON.stringify(users));
    const { password: _pw, ...userData } = newUser;
    setUser(userData);
    localStorage.setItem('enzml_user', JSON.stringify(userData));
    return userData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('enzml_user');
  };

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    localStorage.setItem('enzml_user', JSON.stringify(updated));
    const users = JSON.parse(localStorage.getItem('enzml_users') || '[]');
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updates };
      localStorage.setItem('enzml_users', JSON.stringify(users));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
