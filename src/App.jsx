import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NewPrediction from './pages/NewPrediction';
import Results from './pages/Results';
import BatchResults from './pages/BatchResults';
import Settings from './pages/Settings';
import Experiments from './pages/Experiments';
import ExperimentDetail from './pages/ExperimentDetail';
import ExperimentUpload from './pages/ExperimentUpload';
import Variants from './pages/Variants';
import VariantDetail from './pages/VariantDetail';
import ModelManagement from './pages/ModelManagement';
import Compare from './pages/Compare';
import MutationView from './pages/MutationView';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/predict" element={<ProtectedRoute><Layout><NewPrediction /></Layout></ProtectedRoute>} />
      <Route path="/results/:id" element={<ProtectedRoute><Layout><Results /></Layout></ProtectedRoute>} />
      <Route path="/results-batch" element={<ProtectedRoute><Layout><BatchResults /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
      <Route path="/experiments" element={<ProtectedRoute><Layout><Experiments /></Layout></ProtectedRoute>} />
      <Route path="/experiments/new" element={<ProtectedRoute><Layout><ExperimentUpload /></Layout></ProtectedRoute>} />
      <Route path="/experiments/:id" element={<ProtectedRoute><Layout><ExperimentDetail /></Layout></ProtectedRoute>} />
      <Route path="/variants" element={<ProtectedRoute><Layout><Variants /></Layout></ProtectedRoute>} />
      <Route path="/variants/:id" element={<ProtectedRoute><Layout><VariantDetail /></Layout></ProtectedRoute>} />
      <Route path="/model" element={<ProtectedRoute><Layout><ModelManagement /></Layout></ProtectedRoute>} />
      <Route path="/compare" element={<ProtectedRoute><Layout><Compare /></Layout></ProtectedRoute>} />
      <Route path="/mutations" element={<ProtectedRoute><Layout><MutationView /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
