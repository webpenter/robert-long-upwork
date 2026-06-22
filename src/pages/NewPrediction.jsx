import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle2, AlertCircle, Loader2, Dna, Zap } from 'lucide-react';
import { parseFASTA, parseMultiFASTA, validateSequence, extractFeatures } from '../services/mlService';
import { useApp } from '../context/AppContext';

const SAMPLE_FASTA = `>sp|P00761|TRYP_PIG Trypsin OS=Sus scrofa OX=9823
IVGGYTCGANTVPYQVSLNSGYHFCGGSLINSQWVVSAAHCYKSGIQVRLGEDNINVVEG
NEQFISASKSIVHPSYNSNTLNNDIMLIKLKSAASLNSRVASISLPTSCASAGTQCLISG
WGNTKSSGTSYPDVLKCLKAPILSDSSCKSAYWGSTKVKMVCAGGDGVRSRDLSKVSSTS`;

export default function NewPrediction() {
  const [fasta, setFasta]           = useState('');
  const [fastaError, setFastaError] = useState('');
  const [fastaInfo, setFastaInfo]   = useState(null);
  const [running, setRunning]       = useState(false);
  const [progress, setProgress]     = useState(0);

  const fastaRef = useRef();
  const { addPrediction, addPredictionsBatch, pollPrediction } = useApp();
  const navigate = useNavigate();

  const handleFastaChange = (value) => {
    setFasta(value);
    setFastaError('');
    setFastaInfo(null);
    if (!value.trim()) return;

    const records = parseMultiFASTA(value);
    if (!records.length) return;

    const invalid = records
      .map((r, i) => ({ name: r.header || `Sequence ${i + 1}`, v: validateSequence(r.sequence) }))
      .filter(x => !x.v.valid);
    if (invalid.length) {
      setFastaError(
        records.length === 1
          ? invalid[0].v.error
          : `${invalid.length} of ${records.length} sequences invalid — e.g. "${invalid[0].name}": ${invalid[0].v.error}`
      );
      return;
    }

    if (records.length === 1) {
      const features = extractFeatures(records[0].sequence);
      setFastaInfo({
        multi:    false,
        length:   features.length,
        mw:       features.estimatedMW,
        charged:  features.chargedFraction,
        hydro:    features.avgHydrophobicity,
        truncWarning: features.length > 256,
      });
    } else {
      setFastaInfo({ multi: true, count: records.length });
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleFastaChange(ev.target.result);
    reader.readAsText(file);
  };

  const handleRun = async () => {
    if (!fasta.trim()) { setFastaError('Please enter or upload a FASTA sequence'); return; }

    const records = parseMultiFASTA(fasta);
    if (!records.length) { setFastaError('No sequence detected'); return; }
    const invalid = records
      .map((r, i) => ({ name: r.header || `Sequence ${i + 1}`, v: validateSequence(r.sequence) }))
      .filter(x => !x.v.valid);
    if (invalid.length) {
      setFastaError(
        records.length === 1
          ? invalid[0].v.error
          : `${invalid.length} of ${records.length} sequences invalid — e.g. "${invalid[0].name}": ${invalid[0].v.error}`
      );
      return;
    }

    setRunning(true);
    setProgress(0);
    const interval = setInterval(() => setProgress(p => Math.min(p + 8, 85)), 200);

    try {
      if (records.length === 1) {
        const prediction = await addPrediction({ fastaSequence: fasta, conditions: {} });
        await pollPrediction(prediction._id, (updated) => {
          if (updated.status === 'RUNNING') setProgress(p => Math.min(p + 5, 92));
        });
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => navigate(`/results/${prediction._id}`), 500);
      } else {
        const created = await addPredictionsBatch({
          sequences:  records.map(r => ({ header: r.header, sequence: r.sequence })),
          conditions: {},
        });
        clearInterval(interval);
        setProgress(100);
        const ids = created.map(p => p._id).join(',');
        setTimeout(() => navigate(`/results-batch?ids=${ids}`), 500);
      }
    } catch (err) {
      clearInterval(interval);
      setFastaError(err.message || 'Prediction failed. Is the backend running?');
      setRunning(false);
      setProgress(0);
    }
  };

  // ── Running view ─────────────────────────────────────────────────────────
  if (running) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
            {progress < 100
              ? <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              : <CheckCircle2 className="w-8 h-8 text-green-500" />
            }
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {progress < 100 ? 'Running ProtStabCNN Prediction' : 'Analysis Complete'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {progress < 40  ? 'Encoding sequence...' :
             progress < 70  ? 'Running CNN inference...' :
             progress < 95  ? 'Computing ΔG...' :
             progress < 100 ? 'Saving results...' : 'Redirecting...'}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-2 max-w-xs mx-auto">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">{progress}%</p>

          <div className="mt-8 grid grid-cols-3 gap-3 max-w-xs mx-auto text-xs">
            {[
              { label: 'Encode', done: progress > 30 },
              { label: 'CNN Inference', done: progress > 65 },
              { label: 'ΔG', done: progress > 90 },
            ].map(({ label, done }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="font-medium text-gray-700 mb-1 text-xs">{label}</div>
                {done
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                  : <Loader2 className="w-4 h-4 text-blue-400 animate-spin mx-auto" />
                }
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Input view ───────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stability Prediction</h1>
        <p className="text-gray-500 text-sm mt-1">
          Predict thermodynamic stability (ΔG kcal/mol) from protein sequence using ProtStabCNN
        </p>
      </div>

      {/* Model info banner */}
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 text-sm">
        <Zap className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <div className="text-blue-800">
          <span className="font-semibold">ProtStabCNN v0</span> — Pre-trained on 455,589 protein sequences (DMSv4).
          Input: amino acid sequence (up to 256 aa) → Output: ΔG kcal/mol.
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Dna className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Enter Protein Sequence(s)</h2>
            <p className="text-gray-500 text-sm">Paste one or more FASTA sequences (each starting with &gt;) or upload a .fasta file</p>
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

        {fastaInfo && !fastaError && fastaInfo.multi && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {fastaInfo.count} valid sequences detected — each will be predicted separately.
          </div>
        )}

        {fastaInfo && !fastaError && !fastaInfo.multi && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Valid sequence detected
            </div>
            <div className="grid grid-cols-4 gap-3 text-xs text-green-800">
              <div><span className="font-medium">Length</span><br />{fastaInfo.length} aa</div>
              <div><span className="font-medium">Est. MW</span><br />{fastaInfo.mw} kDa</div>
              <div><span className="font-medium">Charged</span><br />{fastaInfo.charged}%</div>
              <div><span className="font-medium">Avg Hydrophobicity</span><br />{fastaInfo.hydro}</div>
            </div>
            {fastaInfo.truncWarning && (
              <div className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Sequence is &gt;256 aa — CNN will use the first 256 residues (model training limit).
              </div>
            )}
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
            Load sample (trypsin)
          </button>
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            onClick={handleRun}
            disabled={!fasta.trim() || !!fastaError}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors">
            <Zap className="w-4 h-4" />
            Predict ΔG
          </button>
        </div>
      </div>
    </div>
  );
}
