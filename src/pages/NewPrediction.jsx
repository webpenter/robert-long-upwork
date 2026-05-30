import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle2, AlertCircle, ChevronRight, Loader2, Dna, FlaskConical } from 'lucide-react';
import { parseFASTA, validateSequence, extractFeatures } from '../services/mlService';
import { useApp } from '../context/AppContext';

const SAMPLE_FASTA = `>sp|P00761|TRYP_PIG Trypsin OS=Sus scrofa OX=9823
IVGGYTCGANTVPYQVSLNSGYHFCGGSLINSQWVVSAAHCYKSGIQVRLGEDNINVVEG
NEQFISASKSIVHPSYNSNTLNNDIMLIKLKSAASLNSRVASISLPTSCASAGTQCLISG
WGNTKSSGTSYPDVLKCLKAPILSDSSCKSAYWGSTKVKMVCAGGDGVRSRDLSKVSSTS`;

const SOLVENTS = ['aqueous', 'ethanol', 'methanol', 'isopropanol', 'acetone', 'acetonitrile'];
const STEPS = ['Sequence Input', 'Conditions', 'Running'];

function Toggle({ enabled, onToggle }) {
  return (
    <button onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function ConditionBlock({ label, enabled, onToggle, children }) {
  return (
    <div className={`border rounded-xl p-4 transition-all ${enabled ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
        <Toggle enabled={enabled} onToggle={onToggle} />
      </div>
      {enabled && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function NewPrediction() {
  const [step, setStep] = useState(0);
  const [fasta, setFasta] = useState('');
  const [fastaError, setFastaError] = useState('');
  const [fastaInfo, setFastaInfo] = useState(null);
  const [pdbFile, setPdbFile] = useState(null);

  const [condEnabled, setCondEnabled] = useState({ temperature: true, ph: false, solvent: false, ionicStrength: false });
  const [conditions, setConditions] = useState({ temperature: 37, ph: 7.0, solvent: 'aqueous', ionicStrength: 0.15, constraints: '' });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const fastaRef = useRef();
  const pdbRef = useRef();
  const { addPrediction, pollPrediction } = useApp();
  const navigate = useNavigate();

  const toggleCond = (key) => setCondEnabled(c => ({ ...c, [key]: !c[key] }));
  const setNum = (field) => (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) setConditions(c => ({ ...c, [field]: val }));
  };

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
    const interval = setInterval(() => setProgress(p => Math.min(p + 5, 85)), 300);
    try {
      const payload = {
        fastaSequence: fasta,
        conditions: {
          ...(condEnabled.temperature ? { temperature: conditions.temperature } : {}),
          ...(condEnabled.ph ? { ph: conditions.ph } : {}),
          ...(condEnabled.solvent ? { solvent: conditions.solvent } : {}),
          ...(condEnabled.ionicStrength ? { ionicStrength: conditions.ionicStrength } : {}),
        },
        constraints: conditions.constraints || null,
      };
      const prediction = await addPrediction(payload);
      await pollPrediction(prediction._id, (updated) => {
        if (updated.status === 'RUNNING') setProgress(p => Math.min(p + 5, 90));
      });
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => navigate(`/results/${prediction._id}`), 600);
    } catch (err) {
      clearInterval(interval);
      setFastaError(err.message || 'Prediction failed. Is the backend running?');
      setStep(0);
      setRunning(false);
    }
  };

  const activeConditions = Object.values(condEnabled).filter(Boolean).length;

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

      {/* Step 1: Sequence */}
      {step === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {fastaError}
            </div>
          )}

          {fastaInfo && !fastaError && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
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

          <div className="flex items-center gap-3">
            <button onClick={() => fastaRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Upload className="w-4 h-4" />
              Upload .fasta
            </button>
            <input ref={fastaRef} type="file" accept=".fasta,.fa,.txt" className="hidden" onChange={handleFile} />
            <button onClick={() => handleFastaChange(SAMPLE_FASTA)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Load sample sequence
            </button>
          </div>

          {/* PDB upload */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Protein Structure <span className="text-gray-400 font-normal">(optional)</span>
                </p>
                <p className="text-gray-400 text-xs mt-0.5">Upload a .pdb file for structure-informed predictions</p>
              </div>
              {pdbFile ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="max-w-32 truncate">{pdbFile.name}</span>
                  <button onClick={() => setPdbFile(null)} className="text-gray-400 hover:text-gray-600 ml-0.5 text-xs font-bold">×</button>
                </div>
              ) : (
                <button onClick={() => pdbRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  Upload .pdb
                </button>
              )}
              <input ref={pdbRef} type="file" accept=".pdb" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setPdbFile(f); }} />
            </div>
          </div>

          <div className="flex justify-end">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Process Conditions</h2>
              <p className="text-gray-500 text-sm">
                Toggle the conditions you want to target. At least one is required.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Temperature */}
            <ConditionBlock label="Temperature" enabled={condEnabled.temperature} onToggle={() => toggleCond('temperature')}>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={conditions.temperature}
                  onChange={setNum('temperature')}
                  className="w-28 px-3 py-2 border border-blue-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">°C</span>
              </div>
            </ConditionBlock>

            {/* pH */}
            <ConditionBlock label="pH" enabled={condEnabled.ph} onToggle={() => toggleCond('ph')}>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={14}
                  step={0.1}
                  value={conditions.ph}
                  onChange={setNum('ph')}
                  className="w-28 px-3 py-2 border border-blue-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">pH units (0–14)</span>
              </div>
            </ConditionBlock>

            {/* Solvent */}
            <ConditionBlock label="Solvent System" enabled={condEnabled.solvent} onToggle={() => toggleCond('solvent')}>
              <select
                value={conditions.solvent}
                onChange={e => setConditions(c => ({ ...c, solvent: e.target.value }))}
                className="px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {SOLVENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </ConditionBlock>

            {/* Ionic Strength */}
            <ConditionBlock label="Ionic Strength" enabled={condEnabled.ionicStrength} onToggle={() => toggleCond('ionicStrength')}>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.05}
                  value={conditions.ionicStrength}
                  onChange={setNum('ionicStrength')}
                  className="w-28 px-3 py-2 border border-blue-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">M</span>
              </div>
            </ConditionBlock>
          </div>

          {/* Mutation constraints */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mutation Constraints <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={conditions.constraints}
              onChange={e => setConditions(c => ({ ...c, constraints: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Exclude C34, Prefer conservative substitutions at active site (H57, D102, S195)"
            />
          </div>

          {/* Active conditions summary */}
          {activeConditions > 0 && (
            <div className="p-3 bg-slate-50 rounded-lg text-sm text-gray-600">
              <span className="font-medium">Conditions selected:</span>{' '}
              {[
                condEnabled.temperature && `${conditions.temperature}°C`,
                condEnabled.ph && `pH ${conditions.ph}`,
                condEnabled.solvent && conditions.solvent,
                condEnabled.ionicStrength && `${conditions.ionicStrength} M ionic strength`,
              ].filter(Boolean).join(' · ')}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(0)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button
              onClick={handleRun}
              disabled={activeConditions === 0}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
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
