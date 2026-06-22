import { createContext, useContext, useState, useCallback } from 'react';
import api from '../services/apiClient';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [predictionsLoaded, setPredictionsLoaded] = useState(false);

  const fetchProjects = useCallback(async () => {
    const { projects } = await api.get('/projects');
    setProjects(projects);
    setProjectsLoaded(true);
    return projects;
  }, []);

  const fetchPredictions = useCallback(async () => {
    const { predictions } = await api.get('/predictions');
    setPredictions(predictions);
    setPredictionsLoaded(true);
    return predictions;
  }, []);

  const addProject = async (projectData) => {
    const { project } = await api.post('/projects', projectData);
    setProjects((prev) => [project, ...prev]);
    return project;
  };

  const addPrediction = async (predictionData) => {
    const { prediction } = await api.post('/predictions', predictionData);
    setPredictions((prev) => [prediction, ...prev]);
    return prediction;
  };

  // Submit many sequences at once → one prediction per sequence
  const addPredictionsBatch = async ({ sequences, conditions }) => {
    const { predictions: created } = await api.post('/predictions/batch', { sequences, conditions });
    setPredictions((prev) => [...created, ...prev]);
    return created;
  };

  // Poll a prediction until it leaves QUEUED/RUNNING
  const pollPrediction = useCallback(async (id, onUpdate, intervalMs = 2000) => {
    return new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        try {
          const { prediction } = await api.get(`/predictions/${id}`);
          onUpdate?.(prediction);
          if (prediction.status === 'COMPLETED' || prediction.status === 'FAILED') {
            clearInterval(timer);
            setPredictions((prev) =>
              prev.map((p) => (p._id === id ? prediction : p))
            );
            resolve(prediction);
          }
        } catch (err) {
          clearInterval(timer);
          reject(err);
        }
      }, intervalMs);
    });
  }, []);

  const getPrediction = useCallback(
    (id) => predictions.find((p) => p._id === id || p.id === id),
    [predictions]
  );

  return (
    <AppContext.Provider value={{
      projects,
      predictions,
      projectsLoaded,
      predictionsLoaded,
      fetchProjects,
      fetchPredictions,
      addProject,
      addPrediction,
      addPredictionsBatch,
      pollPrediction,
      getPrediction,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
