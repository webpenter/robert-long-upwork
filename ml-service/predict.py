"""
Inference module.
Loads the trained model and predicts stability for all possible
single-point mutations of a given FASTA sequence.
"""

import json, math, os
import numpy as np
import joblib

from features import extract, extract_window, AMINO_ACIDS, BLOSUM62, KD, VOL, CHARGE

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

_model           = None
_rf_uncert       = None
_meta            = None
_fingerprints    = None   # list of L2-normalised 20-dim AA-composition vectors
_sim_threshold   = 0.70
_use_esm         = False  # True when the loaded model was trained with ESM-2 features
_use_cnn         = False  # True when ProtStabCNN is the best model (uses window features)


def _load():
    global _model, _rf_uncert, _meta, _fingerprints, _sim_threshold, _use_esm, _use_cnn
    model_path = os.path.join(MODELS_DIR, 'stability_model.joblib')
    rf_path    = os.path.join(MODELS_DIR, 'rf_for_uncertainty.joblib')
    meta_path  = os.path.join(MODELS_DIR, 'training_meta.json')

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            'Model not found. Run: python train.py --from-csv')

    _model     = joblib.load(model_path)
    _rf_uncert = joblib.load(rf_path) if os.path.exists(rf_path) else None
    with open(meta_path) as f:
        _meta = json.load(f)

    raw = _meta.get('trainingFingerprints', [])
    _fingerprints  = np.array(raw, dtype=np.float32) if raw else None
    _sim_threshold = _meta.get('similarityThreshold', 0.70)
    _use_esm       = _meta.get('esmUsed', False)
    _use_cnn       = _meta.get('cnnUsed', False)


_AA_ORDER = list('ACDEFGHIKLMNPQRSTVWY')

def model_version() -> str:
    if _meta is None:
        _load()
    return _meta.get('modelVersion', 'v1.0')


def _sequence_similarity(seq: str) -> float:
    """
    Cosine similarity between the query sequence's AA composition
    and the nearest training sequence. Returns 1.0 if no fingerprints
    are stored (old model without similarity data).
    """
    if _fingerprints is None or len(_fingerprints) == 0:
        return 1.0

    counts = np.array([seq.count(aa) for aa in _AA_ORDER], dtype=np.float32)
    total  = counts.sum() or 1.0
    vec    = counts / total
    norm   = np.linalg.norm(vec)
    if norm == 0:
        return 0.0
    vec = vec / norm

    # Cosine similarity = dot product (both vectors are already L2-normalised)
    similarities = _fingerprints @ vec
    return float(similarities.max())


def _uncertainty(feat_vec: np.ndarray) -> float:
    """Estimate CI half-width from RF tree variance."""
    if _rf_uncert is None:
        return 0.15
    rf_model = _rf_uncert.named_steps['model']
    scaler   = _rf_uncert.named_steps['scaler']
    x_scaled = scaler.transform(feat_vec.reshape(1, -1))
    tree_preds = np.array([t.predict(x_scaled)[0] for t in rf_model.estimators_])
    return float(np.std(tree_preds))


# ── Structural reason text (physicochemical) ─────────────────────────────────

def _structural_reason(from_aa, to_aa, feat_vec, ddg) -> str:
    blosum   = feat_vec[0]
    d_kd     = feat_vec[1]
    d_vol    = feat_vec[2]
    d_chg    = feat_vec[3]
    burial   = feat_vec[4]

    parts = []

    if burial > 1.0 and d_kd > 0.5:
        parts.append(
            f'Increases hydrophobicity in predicted buried context '
            f'(burial index {burial:.1f}); likely improves hydrophobic packing')
    if from_aa == 'G' and to_aa == 'A':
        parts.append(
            'Gly→Ala: restricts backbone conformational entropy; '
            'commonly stabilising in alpha-helices (learned from training data)')
    if from_aa == 'P':
        parts.append('Removes proline; relieves backbone ring strain')
    if to_aa == 'P':
        parts.append(
            'Proline introduction: rigid ring constrains phi angle — '
            'penalised in most secondary structure contexts')
    if blosum >= 2:
        parts.append(
            f'Evolutionarily conservative (BLOSUM62 +{int(blosum)}); '
            f'high sequence-level tolerance in homologous proteins')
    elif blosum <= -3:
        parts.append(
            f'Rare substitution (BLOSUM62 {int(blosum)}); '
            f'score driven by local physicochemical environment')
    if abs(d_chg) > 0.5:
        sign = '+' if d_chg > 0 else ''
        parts.append(
            f'Net charge change (ΔQ = {sign}{d_chg:.1f}); '
            f'alters local electrostatics')
    if abs(d_vol) > 55:
        sign = '+' if d_vol > 0 else ''
        parts.append(
            f'Large volume change ({sign}{round(d_vol)} Å³); '
            f'may create steric clash or internal cavity')
    if not parts:
        parts.append(
            f'BLOSUM62 {int(blosum):+d}, '
            f'ΔHydrophobicity {d_kd:+.1f}, '
            f'ΔVolume {round(d_vol):+d} Å³ — moderate substitution')

    return '; '.join(parts) + '.'


# ── Activity risk ─────────────────────────────────────────────────────────────

def _activity_risk(from_aa, to_aa, d_chg) -> float:
    diag     = BLOSUM62.get(from_aa, {}).get(from_aa, 4)
    conserv  = max(0.0, (diag - 3) * 0.05)
    chg_risk = min(0.50, abs(d_chg) * 0.35)
    pro      = 0.20 if to_aa == 'P' else 0.0
    cys      = 0.15 if from_aa == 'C' else 0.0
    return round(min(1.0, max(0.0, 0.15 + conserv + chg_risk + pro + cys)), 2)


# ── Supporting variants estimate ──────────────────────────────────────────────

def _supporting_variants(blosum) -> int:
    return max(1, round((blosum + 5) / 16 * 50 + 2))


# ── Main predict function ─────────────────────────────────────────────────────

def predict_for_sequence(sequence: str, conditions: dict, tier: str) -> dict:
    """
    Scan all single-point mutations of `sequence`.
    Returns top-20 ranked candidates + hotspot map.
    """
    if _model is None:
        _load()

    seq = sequence.upper().replace('\n', '').replace(' ', '')
    if len(seq) < 5:
        raise ValueError('Sequence too short (minimum 5 residues)')

    valid_aa = set('ACDEFGHIKLMNPQRSTVWY')
    bad = [c for c in seq if c not in valid_aa]
    if bad:
        raise ValueError(f'Non-standard residues: {set(bad)}')

    # ── Normalise user conditions once (shared across all mutations) ─────────
    from features import TEMP_REF_K, TEMP_SCALE, PH_REF, PH_SCALE
    user_temp_c = conditions.get('temperature', 25.0)
    user_ph     = conditions.get('ph', 7.0)
    norm_conds  = {
        'temp_norm': ((user_temp_c + 273.15) - TEMP_REF_K) / TEMP_SCALE,
        'ph_norm':   (user_ph - PH_REF) / PH_SCALE,
    }

    # ── ESM-2 masked marginals (one batched forward pass for the whole sequence) ──
    _esm_marginals = None
    if _use_esm:
        try:
            from esm_embedder import get_masked_marginals
            _esm_marginals = get_masked_marginals(seq)
        except ImportError:
            pass   # ESM was used at training but not available now; scores fall back to 0.0

    # ── Pass 1: score every possible substitution ─────────────────────────
    per_position = []

    for i, from_aa in enumerate(seq):
        position = i + 1
        scores_at_pos = []

        for to_aa in AMINO_ACIDS:
            if to_aa == from_aa:
                continue

            if _use_cnn:
                # ProtStabCNN uses sequence-window features
                feat = extract_window(from_aa, to_aa, position, seq)
            else:
                esm_sc = None
                if _use_esm and _esm_marginals is not None:
                    lp_to   = _esm_marginals.get((i, to_aa),   -20.0)
                    lp_from = _esm_marginals.get((i, from_aa),  -20.0)
                    esm_sc  = float(lp_to - lp_from)
                elif _use_esm:
                    esm_sc = 0.0
                feat = extract(from_aa, to_aa, position, seq, norm_conds, esm_sc)

            pred = float(_model.predict(feat.reshape(1, -1))[0])
            scores_at_pos.append((to_aa, feat, pred))

        best_to, best_feat, best_score = max(scores_at_pos, key=lambda x: x[2])
        mean_score = float(np.mean([s[2] for s in scores_at_pos]))
        per_position.append({
            'position': position,
            'from_aa':  from_aa,
            'best_to':  best_to,
            'best_feat': best_feat,
            'best_score': best_score,
            'mean_score': mean_score,
        })

    # ── Sort by best_score descending, keep only stabilising (best_score > 0) ──
    # S1724 internal convention: positive best_score = stabilising.
    # We output ddG in traditional biochemistry convention: negative = stabilising,
    # so we negate at output. Filter to genuinely stabilising positions first;
    # if none exist (e.g. very short fragment) fall back to least-destabilising.
    sorted_pos = sorted(per_position, key=lambda x: x['best_score'], reverse=True)
    stabilising = [e for e in sorted_pos if e['best_score'] > 0]
    top20 = (stabilising if stabilising else sorted_pos)[:20]

    candidates = []
    for rank, entry in enumerate(top20, start=1):
        pos      = entry['position']
        from_aa  = entry['from_aa']
        to_aa    = entry['best_to']
        feat     = entry['best_feat']
        ddg      = entry['best_score']     # internal S1724: positive = stabilising

        blosum   = float(feat[0])
        d_kd     = float(feat[1])
        d_vol    = float(feat[2])
        d_chg    = float(feat[3])

        uncert   = _uncertainty(feat)

        # Output convention: negative ddG = stabilising (traditional biochemistry).
        # Negate so the UI ("more negative = more stable") is correct.
        ddG_out = round(-ddg, 2)

        # Backward-compat fold-change: exp(ddG_internal / RT) at 37°C
        RT = 0.616
        fold_change = float(np.exp(min(ddg / RT, 10)))   # cap to avoid overflow

        # dTm approximation: ~2.5 °C per kcal/mol at typical Tm.
        # Positive dTm = Tm increases = stabilising. Uses internal ddg (positive = stabilising).
        dTm = round(ddg * 2.5, 2)

        cand = {
            'rank':          rank,
            'mutation':      f'{from_aa}{pos}{to_aa}',
            'position':      pos,
            'originalAa':    from_aa,
            'substitutedAa': to_aa,
        }

        if tier in ('SILVER', 'GOLD'):
            cand['predictedFoldChange']      = round(fold_change, 4)
            cand['ddG']                      = ddG_out
            cand['predictedStabilityChange'] = dTm
            cand['confidenceLow']            = round(ddG_out - uncert * 0.5, 2)
            cand['confidenceHigh']           = round(ddG_out + uncert * 0.5, 2)
            cand['activityRisk']             = _activity_risk(from_aa, to_aa, d_chg)
            cand['supportingVariants']       = _supporting_variants(blosum)
            cand['structuralReason']         = _structural_reason(from_aa, to_aa, feat, ddg)

        candidates.append(cand)

    # ── Hotspot map (Silver/Gold) ─────────────────────────────────────────
    hotspot_map = []
    if tier in ('SILVER', 'GOLD'):
        for entry in sorted(per_position, key=lambda x: x['position']):
            # mutational tolerance: positions where mutations are near-neutral on average
            # mean_score is now mean ddG; 0 = neutral, negative = average destabilising
            mean_s = entry['mean_score']
            tolerance = float(1.0 / (1.0 + np.exp(-mean_s * 3)))
            # stabilisation potential: how much can the best mutation gain (kcal/mol)
            # cap at 2 kcal/mol → potential = 1.0
            potential = float(min(1.0, max(0.0, entry['best_score'] / 2.0)))
            hotspot_map.append({
                'position':              entry['position'],
                'residue':               entry['from_aa'],
                'mutationalTolerance':   round(tolerance, 3),
                'stabilizationPotential': round(potential, 3),
            })

    sim_score = _sequence_similarity(seq)

    # Flag when requested conditions are outside the training distribution.
    # S1724 temperature range: ~288–303 K (15–30 °C). Beyond ±1.5 norm units
    # the model is extrapolating; tree models clamp predictions at leaf edges.
    temp_norm_val = norm_conds['temp_norm']
    ph_norm_val   = norm_conds['ph_norm']
    cond_outside  = abs(temp_norm_val) > 1.5 or abs(ph_norm_val) > 1.5

    return {
        'candidates':            candidates,
        'hotspotMap':            hotspot_map,
        'modelVersion':          model_version(),
        'nTrainingVars':         _meta.get('nVariants', 50) if _meta else 50,
        'similarityScore':       round(sim_score, 3),
        'similarityWarning':     sim_score < _sim_threshold,
        'conditionOutOfRange':   cond_outside,
        'conditionNote':         (
            f'Requested conditions (T={user_temp_c}°C, pH={user_ph}) are outside '
            f'the training distribution (S1724: 15–30°C, pH 5–8). '
            f'Predictions are extrapolated; treat with additional caution.'
        ) if cond_outside else '',
    }
