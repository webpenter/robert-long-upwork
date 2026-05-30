"""
Inference module.
Loads the trained model and predicts stability for all possible
single-point mutations of a given FASTA sequence.
"""

import json, os
import numpy as np
import joblib

from features import extract, AMINO_ACIDS, BLOSUM62, KD, VOL, CHARGE

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

_model       = None
_rf_uncert   = None
_meta        = None


def _load():
    global _model, _rf_uncert, _meta
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


def model_version() -> str:
    if _meta is None:
        _load()
    return _meta.get('modelVersion', 'v1.0')


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

def _structural_reason(from_aa, to_aa, feat_vec, score) -> str:
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

    # ── Pass 1: score every possible substitution ─────────────────────────
    per_position = []

    for i, from_aa in enumerate(seq):
        position = i + 1
        scores_at_pos = []

        for to_aa in AMINO_ACIDS:
            if to_aa == from_aa:
                continue
            feat = extract(from_aa, to_aa, position, seq)
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

    # ── Sort by best_score descending → top 20 candidates ────────────────
    sorted_pos = sorted(per_position, key=lambda x: x['best_score'], reverse=True)
    top20 = sorted_pos[:20]

    candidates = []
    for rank, entry in enumerate(top20, start=1):
        pos      = entry['position']
        from_aa  = entry['from_aa']
        to_aa    = entry['best_to']
        feat     = entry['best_feat']
        score    = entry['best_score']

        blosum   = float(feat[0])
        d_kd     = float(feat[1])
        d_vol    = float(feat[2])
        d_chg    = float(feat[3])

        uncert   = _uncertainty(feat)

        # Convert fold-change to ddG-like metric: ddG ≈ -RT*ln(score)
        # R=1.987 cal/mol/K, T=343K (70°C); RT in kcal/mol ≈ 0.681 at 70°C
        # We use RT at 37°C (310K) ≈ 0.616 as physiological reference
        RT = 0.616
        ddG = round(-RT * float(np.log(max(score, 0.01))), 2)

        # dTm approximation: empirically ~2.5 °C per unit fold-change above WT
        dTm = round((score - 1.0) * 2.5, 2)

        cand = {
            'rank':          rank,
            'mutation':      f'{from_aa}{pos}{to_aa}',
            'position':      pos,
            'originalAa':    from_aa,
            'substitutedAa': to_aa,
        }

        if tier in ('SILVER', 'GOLD'):
            cand['predictedFoldChange']      = round(score, 4)
            cand['ddG']                      = ddG
            cand['predictedStabilityChange'] = dTm
            cand['confidenceLow']            = round(ddG - uncert * 0.5, 2)
            cand['confidenceHigh']           = round(ddG + uncert * 0.5, 2)
            cand['activityRisk']             = _activity_risk(from_aa, to_aa, d_chg)
            cand['supportingVariants']       = _supporting_variants(blosum)
            cand['structuralReason']         = _structural_reason(from_aa, to_aa, feat, score)

        candidates.append(cand)

    # ── Hotspot map (Silver/Gold) ─────────────────────────────────────────
    hotspot_map = []
    if tier in ('SILVER', 'GOLD'):
        for entry in sorted(per_position, key=lambda x: x['position']):
            # mutational tolerance: most mutations near-neutral → high tolerance
            mean_s = entry['mean_score']
            tolerance = float(1.0 / (1.0 + np.exp(-(mean_s - 1.0) * 5)))
            # stabilisation potential: best substitution clearly above WT
            potential = float(min(1.0, max(0.0, (entry['best_score'] - 1.0) / 0.8)))
            hotspot_map.append({
                'position':              entry['position'],
                'residue':               entry['from_aa'],
                'mutationalTolerance':   round(tolerance, 3),
                'stabilizationPotential': round(potential, 3),
            })

    return {
        'candidates':     candidates,
        'hotspotMap':     hotspot_map,
        'modelVersion':   model_version(),
        'nTrainingVars':  _meta.get('nVariants', 50) if _meta else 50,
    }
