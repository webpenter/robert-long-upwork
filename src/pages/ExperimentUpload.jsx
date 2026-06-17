import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle2, AlertCircle, ChevronRight, FileSpreadsheet, Loader2, X } from 'lucide-react';
import api from '../services/apiClient';

const ASSAY_TYPES = ['THERMAL', 'PH', 'SOLVENT', 'IONIC_STRENGTH', 'OTHER'];
const STEPS = ['Experiment Details', 'Upload File'];

export default function ExperimentUpload() {
  const navigate = useNavigate();
  const fileRef = useRef();

  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    name: '',
    projectId: '',
    date: new Date().toISOString().split('T')[0],
    assayType: 'THERMAL',
    operator: '',
    instrument: '',
    notes: '',
  });
  const [formError, setFormError] = useState('');
  const [createdExperiment, setCreatedExperiment] = useState(null);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState([]);

  useEffect(() => {
    api.get('/projects').then(({ projects }) => {
      setProjects(projects);
      if (projects.length > 0) setForm(f => ({ ...f, projectId: projects[0]._id }));
    }).catch(console.error);
  }, []);

  const set = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setFormError('');
  };

  const handleStep1 = async () => {
    if (!form.name.trim()) return setFormError('Experiment name is required');
    if (!form.projectId) return setFormError('Please select a project');
    if (!form.date) return setFormError('Date is required');

    try {
      const { experiment } = await api.post('/experiments', {
        name: form.name.trim(),
        projectId: form.projectId,
        date: form.date,
        assayType: form.assayType,
        operator: form.operator.trim() || undefined,
        instrument: form.instrument.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setCreatedExperiment(experiment);
      setStep(1);
    } catch (err) {
      setFormError(err.message || 'Failed to create experiment');
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setUploadError(''); }
  };

  const handleUpload = async () => {
    if (!file) return setUploadError('Please select a file to upload');
    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('experimentId', createdExperiment._id);

    try {
      const { access } = api.getTokens();
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/uploads`, {
        method: 'POST',
        headers: access ? { Authorization: `Bearer ${access}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (data.warnings?.length) setUploadWarnings(data.warnings);
      setUploadDone(true);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = () => navigate(`/experiments/${createdExperiment._id}`);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              i === step ? 'bg-blue-600 text-white' :
              i < step ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 h-4 text-center text-xs">{i + 1}</span>}
              {s}
            </div>
            {i < STEPS.length - 1 && <div className={`w-8 h-px mx-1 ${i < step ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Experiment metadata */}
      {step === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Experiment Details</h2>
              <p className="text-gray-500 text-sm">Describe the assay run before uploading data</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Experiment name <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={set('name')}
                placeholder="e.g. CALB Thermal Screen Plate 1"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Project <span className="text-red-500">*</span></label>
                <select value={form.projectId} onChange={set('projectId')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {projects.length === 0 && <option value="">Loading...</option>}
                  {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assay type <span className="text-red-500">*</span></label>
                <select value={form.assayType} onChange={set('assayType')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {ASSAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.date} onChange={set('date')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Operator</label>
                <input value={form.operator} onChange={set('operator')}
                  placeholder="e.g. J. Smith"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Instrument</label>
                <input value={form.instrument} onChange={set('instrument')}
                  placeholder="e.g. CLARIOstar Plus"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={set('notes')} rows={2}
                placeholder="Optional notes about this run..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex justify-between pt-1">
            <button onClick={() => navigate('/experiments')}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleStep1}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
              Next: Upload File
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload file */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Upload className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Upload Plate Reader Data</h2>
              <p className="text-gray-500 text-sm">
                Experiment <strong>{createdExperiment?.name}</strong> created — now attach your data file
              </p>
            </div>
          </div>

          {uploadDone ? (
            <div className="space-y-4">
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">File uploaded successfully</p>
                  <p className="text-gray-500 text-sm mt-1">The data will be parsed and measurements will appear in the experiment.</p>
                </div>
                <button onClick={() => navigate(`/experiments/${createdExperiment._id}`)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
                  View Experiment
                </button>
              </div>
              {uploadWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 mb-1">Validation warnings</p>
                        <ul className="space-y-1">
                          {uploadWarnings.map((w, i) => <li key={i} className="text-sm text-amber-700">{w}</li>)}
                        </ul>
                      </div>
                    </div>
                    <button onClick={() => setUploadWarnings([])} className="text-amber-400 hover:text-amber-600 flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  file ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}>
                <FileSpreadsheet className={`w-10 h-10 mx-auto mb-3 ${file ? 'text-blue-500' : 'text-gray-300'}`} />
                {file ? (
                  <>
                    <p className="font-medium text-gray-900 text-sm">{file.name}</p>
                    <p className="text-gray-400 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB — click to change</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-gray-700 text-sm">Click to select or drag & drop</p>
                    <p className="text-gray-400 text-xs mt-1">Supports .xlsx, .xls, .csv — reads first sheet automatically — up to 50 MB</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {uploadError}
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={handleSkip}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  Skip for now
                </button>
                <button onClick={handleUpload} disabled={!file || uploading}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload File</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
