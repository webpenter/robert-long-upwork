import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle2, AlertCircle, ChevronRight, Loader2, Dna, Thermometer, FlaskConical } from 'lucide-react';
import { parseFASTA, validateSequence, extractFeatures, generatePrediction } from '../services/mlService';
import { useApp } from '../context/AppContext';

const SAMPLE_FASTA = `>sp|P00761|TRYP_PIG Trypsin OS=Sus scrofa OX=9823
IVGGYTCGANTVPYQVSLNSGYHFCGGSLINSQWVVSAAHCYKSGIQVRLGEDNINVVEG
NEQFISASKSIVHPSYNSNTLNNDIMLIKLKSAASLNSRVASISLPTSCASAGTQCLISG
WGNTKSSGTSYPDVLKCLKAPILSDSSCKSAYWGSTKVKMVCAGGDGVRSRDLSKVSSTS`;

const STEPS = ['FASTA Input', 'Conditions', 'Running'];

export default function NewPrediction() {
  const [step, setStep] = useState(0);
  const [fasta, setFasta] = useState('');
  const [fastaError, setFastaError] = useState('');
  const [fastaInfo, setFastaInfo] = useState(null);
  const [conditions, setConditions] = useState({ temperature: 37, ph: 7.0, solvent: 'aqueous', ionicStrength: 0.15, constraints: '' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef();
  const { addPrediction } = useApp();
  const navigate = useNavigate();

  const handleFastaChange = (value) => {
    setFasta(value);
    setFastaError('');
    setFastaInfo(null);
    if (!value.trim()) return;
    const { sequence } = parseFASTA(value);
    const v = validateSequence(sequence);
    if (!v.valid) { setFastaError(v.error); return; }
    const features = extractFeatures(sequence);
    setFastaInfo({ length: features.length, mw: features.estimatedMW, charged: features.chargedFraction, hydro: features.avgHydrophobicity });
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleFastaChange(ev.target.result);
    reader.readAsText(file);
  };

  const handleStep1Next = () => {
    if (!fasta.trim()) { setFastaError('Please enter or upload a FASTA sequence'); return; }
    const { sequence } = parseFASTA(fasta);
    const v = validateSequence(sequence);
    if (!v.valid) { setFastaError(v.error); return; }
    setStep(1);
  };

  const handleRun = async () => {
    setStep(2);
    setRunning(true);
    setProgress(0);
    const interval = setInterval(() => setProgress(p => Math.min(p + 8, 90)), 200);
    try {
      const result = await generatePrediction(fasta, conditions);
      clearInterval(interval);
      setProgress(100);
      addPrediction(result);
      setTimeout(() => navigate(`/results/${result.id}`), 600);
    } catch (err) {
      clearInterval(interval);
      setFastaError(err.message);
      setStep(0);
      setRunning(false);
    }
  };

  const set = (field) => (e) => setConditions(c => ({ ...c, [field]: e.target.type === 'range' ? parseFloat(e.target.value) : e.target.value }));

  return (
    <div className="p-6 max-w-3xl mx-auto">
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

      {/* Step 1: FASTA Input */}
      {step === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Dna className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Enter Enzyme Sequence</h2>
              <p className="text-gray-500 text-sm">Paste your FASTA sequence or upload a .fasta file</p>
            </div>
          </div>

          <textarea
            value={fasta}
            onChange={e => handleFastaChange(e.target.value)}
            rows={10}
            className={`w-full px-4 py-3 border rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              fastaError ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
            placeholder={SAMPLE_FASTA}
          />

          {fastaError && (
            <div className="flex items-center gap-2 mt-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {fastaError}
            </div>
          )}

          {fastaInfo && !fastaError && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-2">
                <CheckCircle2 className="w-4 h-4" />
                Valid sequence detected
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs text-green-800">
                <div><span className="font-medium">Length</span><br />{fastaInfo.length} aa</div>
                <div><span className="font-medium">Est. MW</span><br />{fastaInfo.mw} kDa</div>
                <div><span className="font-medium">Charged</span><br />{fastaInfo.charged}%</div>
                <div><span className="font-medium">Hydrophobicity</span><br />{fastaInfo.hydro}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Upload className="w-4 h-4" />
              Upload .fasta file
            </button>
            <input ref={fileRef} type="file" accept=".fasta,.fa,.txt" className="hidden" onChange={handleFile} />
            <button onClick={() => handleFastaChange(SAMPLE_FASTA)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Load sample sequence
            </button>
          </div>

          <div className="flex justify-end mt-6">
            <button onClick={handleStep1Next}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
              Next: Set Conditions
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Conditions */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <Thermometer className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Process Conditions</h2>
              <p className="text-gray-500 text-sm">Define the target environment for stability prediction</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Temperature */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Temperature</label>
                <span className="text-sm font-semibold text-blue-600">{conditions.temperature}°C</span>
              </div>
              <input type="range" min={20} max={90} step={1} value={conditions.temperature} onChange={set('temperature')}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>20°C (cool)</span><span>55°C (industrial)</span><span>90°C (extreme)</span>
              </div>
            </div>

            {/* pH */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">pH</label>
                <span className="text-sm font-semibold text-blue-600">{conditions.ph}</span>
              </div>
              <input type="range" min={2} max={12} step={0.5} value={conditions.ph} onChange={set('ph')}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>2 (acid)</span><span>7 (neutral)</span><span>12 (base)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Solvent */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Solvent System</label>
                <select value={conditions.solvent} onChange={set('solvent')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="aqueous">Aqueous</option>
                  <option value="organic">Organic</option>
                  <option value="mixed">Mixed (50/50)</option>
                  <option value="ionic-liquid">Ionic Liquid</option>
                </select>
              </div>
              {/* Ionic Strength */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ionic Strength (M)</label>
                <input type="number" min={0} max={1} step={0.05} value={conditions.ionicStrength}
                  onChange={e => setConditions(c => ({ ...c, ionicStrength: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Optional constraints */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mutation Constraints <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea value={conditions.constraints} onChange={set('constraints')} rows={2}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Exclude C34, Prefer conservative substitutions at active site (H57, D102, S195)" />
            </div>
          </div>

          {/* Condition summary */}
          <div className="mt-5 p-3 bg-slate-50 rounded-lg text-sm text-gray-600">
            <span className="font-medium">Prediction target:</span>{' '}
            Stability at <strong>{conditions.temperature}°C</strong>, pH <strong>{conditions.ph}</strong>,{' '}
            <strong>{conditions.solvent}</strong> solvent, <strong>{conditions.ionicStrength} M</strong> ionic strength
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(0)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button onClick={handleRun}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
              <FlaskConical className="w-4 h-4" />
              Run Prediction
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Running */}
      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
            {progress < 100
              ? <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              : <CheckCircle2 className="w-8 h-8 text-green-500" />
            }
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {progress < 100 ? 'Running ML Prediction Pipeline' : 'Analysis Complete!'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {progress < 30 ? 'Parsing sequence and extracting features...' :
             progress < 60 ? 'Generating mutation candidates...' :
             progress < 90 ? 'Scoring stability and confidence...' :
             progress < 100 ? 'Ranking results...' : 'Redirecting to results...'}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-2.5 max-w-sm mx-auto">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-3">{progress}% complete</p>

          <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm mx-auto text-xs text-gray-500">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-medium text-gray-700 mb-1">Feature Extraction</div>
              <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-medium text-gray-700 mb-1">ML Inference</div>
              {progress > 50 ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <Loader2 className="w-4 h-4 text-blue-400 animate-spin mx-auto" />}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-medium text-gray-700 mb-1">Ranking</div>
              {progress > 85 ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-200 mx-auto" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
