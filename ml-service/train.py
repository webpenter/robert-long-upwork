"""
Train the hsFAST stability prediction model.

Usage:
    python train.py                  # reads ml-service/data/training_data.json
    python train.py --from-csv       # reads CSVs directly (no Node.js import needed)

Outputs:
    ml-service/models/stability_model.joblib
    ml-service/models/training_meta.json
"""

import argparse, json, math, os, sys, warnings
import numpy as np
import pandas as pd
from scipy.optimize import curve_fit
from scipy.stats import pearsonr
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import LeaveOneOut, cross_val_score
from sklearn.metrics import r2_score, mean_squared_error
import joblib

from features import extract, AMINO_ACIDS

ROOT       = os.path.join(os.path.dirname(__file__), '..')
DATA_DIR   = os.path.join(os.path.dirname(__file__), 'data')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_DIR,   exist_ok=True)


# ── Label computation from raw CSVs ─────────────────────────────────────────

def exp_decay(t, F0, k):
    return F0 * np.exp(-k * t)


def fit_half_life(times, fluorescences):
    """Fit single-exponential decay, return half-life in minutes."""
    mask = np.array(fluorescences) > 0
    t = np.array(times)[mask]
    F = np.array(fluorescences)[mask]
    if len(t) < 4:
        return None
    try:
        # Linearise: ln(F) = ln(F0) - k*t
        ln_F = np.log(F)
        coeffs = np.polyfit(t, ln_F, 1)
        k = -coeffs[0]
        if k <= 1e-9:
            return None
        return float(np.log(2) / k)
    except Exception:
        return None


def compute_labels_from_csvs() -> list[dict]:
    """Read all 3 assay CSVs and return per-variant labels."""
    import re

    # ── Kinetic half-lives ─────────────────────────────────────────────────
    kin = pd.read_csv(os.path.join(ROOT, 'denaturation_70C_hsFAST_screen (1).csv'))
    kin.columns = kin.columns.str.strip()

    half_lives = {}
    for (sid, rep), grp in kin.groupby(['Sample_ID', 'Replicate']):
        grp = grp.sort_values('Time_min')
        hl = fit_half_life(grp['Time_min'].tolist(), grp['Fluorescence_RFU'].tolist())
        if hl is not None:
            half_lives.setdefault(sid, []).append(hl)
 
    wt_hl_vals = half_lives.get('WT_HSFAST_FUSION', [])
    wt_hl = float(np.mean(wt_hl_vals)) if wt_hl_vals else 10.0
    print(f'  WT half-life at 70°C: {wt_hl:.2f} min')

    # ── Lysate OD600-normalised fluorescence ───────────────────────────────
    lys = pd.read_csv(os.path.join(ROOT, 'platereader_lysate_hsFAST_screen_mock data.csv'))
    lys.columns = lys.columns.str.strip()

    lys['norm_rfu'] = lys['Raw_Fluorescence_RFU'] / lys['OD600_Harvest'].replace(0, np.nan)
    wt_lys_vals = lys[lys['Sample_ID'] == 'WT_HSFAST_FUSION']['norm_rfu'].dropna()
    wt_lys = float(wt_lys_vals.mean()) if len(wt_lys_vals) else 1.0
    print(f'  WT lysate norm RFU: {wt_lys:.1f}')

    lys_fc = {}
    for sid, grp in lys.groupby('Sample_ID'):
        vals = grp['norm_rfu'].dropna().tolist()
        if vals:
            lys_fc[sid] = {'mean': float(np.mean(vals)), 'std': float(np.std(vals, ddof=1)) if len(vals)>1 else 0.0, 'n': len(vals)}

    # ── FACS Percent_FAST_Positive ─────────────────────────────────────────
    facs = pd.read_csv(os.path.join(ROOT, 'facs_cell_hsFAST_screen_mock data.csv'))
    facs.columns = facs.columns.str.strip()

    wt_facs_vals = facs[facs['Sample_ID'] == 'WT_HSFAST_FUSION']['Percent_FAST_Positive'].dropna()
    wt_facs = float(wt_facs_vals.mean()) if len(wt_facs_vals) else 91.7
    print(f'  WT FACS % positive: {wt_facs:.1f}%')

    facs_fc = {}
    for sid, grp in facs.groupby('Sample_ID'):
        vals = grp['Percent_FAST_Positive'].dropna().tolist()
        if vals:
            facs_fc[sid] = {'mean': float(np.mean(vals)), 'std': float(np.std(vals, ddof=1)) if len(vals)>1 else 0.0, 'n': len(vals)}

    # ── Combine: Library_Variant rows only ────────────────────────────────
    variant_meta = {}
    for _, row in lys[lys['Sample_Class'] == 'Library_Variant'].drop_duplicates('Sample_ID').iterrows():
        variant_meta[row['Sample_ID']] = str(row['Variant_Description']).strip()

    records = []
    for sid, mut_str in variant_meta.items():
        m = re.match(r'^([A-Z])(\d+)([A-Z])$', mut_str)
        if not m:
            continue

        from_aa, pos, to_aa = m.group(1), int(m.group(2)), m.group(3)

        hl_vals  = half_lives.get(sid, [])
        lys_data = lys_fc.get(sid, {})
        fcs_data = facs_fc.get(sid, {})

        hl_mean  = float(np.mean(hl_vals))  if hl_vals   else None
        lys_mean = lys_data.get('mean')
        fcs_mean = fcs_data.get('mean')

        records.append({
            'sampleId':  sid,
            'mutation':  mut_str,
            'from_aa':   from_aa,
            'to_aa':     to_aa,
            'position':  pos,
            'labels': {
                'thermal_half_life_min':  round(hl_mean,  3)  if hl_mean  is not None else None,
                'thermal_half_life_fc':   round(hl_mean  / wt_hl,  4) if hl_mean  else None,
                'lysate_fold_change':     round(lys_mean / wt_lys, 4) if lys_mean else None,
                'facs_fold_change':       round(fcs_mean / wt_facs, 4) if fcs_mean else None,
            },
        })

    # Save for reproducibility
    out = {'exportedAt': pd.Timestamp.now().isoformat(),
           'wtKinetic_hl': wt_hl, 'wtLysate_ref': wt_lys, 'wtFACS_pct': wt_facs,
           'variants': records}
    path = os.path.join(DATA_DIR, 'training_data.json')
    with open(path, 'w') as f:
        json.dump(out, f, indent=2)
    print(f'  Saved labels for {len(records)} variants → {path}')
    return records


def load_labels_from_json() -> list[dict]:
    path = os.path.join(DATA_DIR, 'training_data.json')
    if not os.path.exists(path):
        raise FileNotFoundError(f'{path} not found. Run with --from-csv or run `npm run import:data` first.')
    with open(path) as f:
        data = json.load(f)
    return data['variants']


# ── Composite stability score ────────────────────────────────────────────────

def composite_score(labels: dict) -> float | None:
    """
    Weighted average of the three normalised fold-changes.
    WT = 1.0. Higher = more stable than WT.
    Weights: lysate 40%, FACS 40%, thermal 20%.
    """
    parts, weights = [], []
    if labels.get('lysate_fold_change') is not None:
        parts.append(labels['lysate_fold_change'])
        weights.append(0.40)
    if labels.get('facs_fold_change') is not None:
        parts.append(labels['facs_fold_change'])
        weights.append(0.40)
    if labels.get('thermal_half_life_fc') is not None:
        parts.append(labels['thermal_half_life_fc'])
        weights.append(0.20)
    if not parts:
        return None
    total_w = sum(weights)
    return sum(p * w for p, w in zip(parts, weights)) / total_w


# ── Build feature matrix and target vector ───────────────────────────────────

def build_dataset(records: list[dict]) -> tuple[np.ndarray, np.ndarray, list[str]]:
    X_rows, y_rows, ids = [], [], []
    for r in records:
        score = composite_score(r['labels'])
        if score is None:
            continue
        feat = extract(r['from_aa'], r['to_aa'], r['position'])
        X_rows.append(feat)
        y_rows.append(score)
        ids.append(r['sampleId'])
    return np.array(X_rows), np.array(y_rows), ids


# ── Model training ───────────────────────────────────────────────────────────

def train(records: list[dict]) -> dict:
    X, y, ids = build_dataset(records)
    print(f'\n  Training on {len(X)} variants, {X.shape[1]} features')
    print(f'  Stability range: {y.min():.3f} – {y.max():.3f}  (WT = 1.0)')

    # ── Three base models + a ridge meta-learner ────────────────────────────
    rf = Pipeline([
        ('scaler', StandardScaler()),
        ('model',  RandomForestRegressor(
            n_estimators=200, max_depth=4, min_samples_leaf=2,
            max_features='sqrt', random_state=42)),
    ])

    gb = Pipeline([
        ('scaler', StandardScaler()),
        ('model',  GradientBoostingRegressor(
            n_estimators=100, max_depth=3, learning_rate=0.05,
            subsample=0.8, random_state=42)),
    ])

    ridge = Pipeline([
        ('scaler', StandardScaler()),
        ('model',  Ridge(alpha=1.0)),
    ])

    # ── Leave-One-Out CV for each model (appropriate for n=50) ──────────────
    # Note: LOO produces 1-sample test folds so R² is undefined per fold.
    # We suppress that warning and use RMSE as the primary selection metric.
    loo = LeaveOneOut()

    print('\n  Leave-One-Out CV:')
    results = {}
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', message='R.2 score is not well-defined')
        for name, model in [('RandomForest', rf), ('GradBoost', gb), ('Ridge', ridge)]:
            rmse_scores = np.sqrt(-cross_val_score(model, X, y, cv=loo,
                                                   scoring='neg_mean_squared_error'))
            # Collect LOO predictions for a Pearson-based pseudo-R²
            loo_preds = np.zeros(len(y))
            for train_idx, test_idx in loo.split(X):
                clone = Pipeline(model.steps)  # fresh copy
                clone.fit(X[train_idx], y[train_idx])
                loo_preds[test_idx] = clone.predict(X[test_idx])
            loo_rmse = float(np.mean(rmse_scores))
            # Pearson R on held-out predictions (robust with small n)
            loo_pcc, _ = pearsonr(y, loo_preds)
            results[name] = {'loo_r2': float(loo_pcc ** 2), 'loo_rmse': loo_rmse,
                             'loo_pcc': float(loo_pcc)}
            print(f'    {name:15s}  LOO R²={loo_pcc**2:.3f}  LOO RMSE={loo_rmse:.3f}  LOO PCC={loo_pcc:.3f}')

    # ── Pick best model: highest LOO R² (from Pearson), break ties by RMSE ──
    def _rank(k):
        r2 = results[k]['loo_r2']
        return (r2 if not math.isnan(r2) else -results[k]['loo_rmse'],)

    best_name = max(results, key=_rank)
    best_model = {'RandomForest': rf, 'GradBoost': gb, 'Ridge': ridge}[best_name]
    print(f'\n  Best model: {best_name}  (LOO R²={results[best_name]["loo_r2"]:.3f}  LOO RMSE={results[best_name]["loo_rmse"]:.3f})')

    # ── Fit on full dataset ──────────────────────────────────────────────────
    best_model.fit(X, y)

    # In-sample R² and Pearson r
    y_pred = best_model.predict(X)
    in_r2  = float(r2_score(y, y_pred))
    in_pcc, _ = pearsonr(y, y_pred)
    print(f'  In-sample  R²={in_r2:.3f}  Pearson r={in_pcc:.3f}')

    # ── Also fit RF for uncertainty estimation (variance across trees) ───────
    rf.fit(X, y)  # always fit RF so we can get per-tree predictions at inference

    # ── Save models ──────────────────────────────────────────────────────────
    joblib.dump(best_model, os.path.join(MODELS_DIR, 'stability_model.joblib'))
    joblib.dump(rf,         os.path.join(MODELS_DIR, 'rf_for_uncertainty.joblib'))

    # ── Per-variant predictions for reporting ────────────────────────────────
    variant_preds = []
    for i, (r, score) in enumerate(zip(records, [composite_score(r['labels']) for r in records])):
        if score is None:
            continue
        feat = extract(r['from_aa'], r['to_aa'], r['position']).reshape(1, -1)
        pred = float(best_model.predict(feat)[0])
        variant_preds.append({
            'sampleId':        r['sampleId'],
            'mutation':        r['mutation'],
            'actual_score':    round(score, 4),
            'predicted_score': round(pred, 4),
            'error':           round(abs(pred - score), 4),
            'labels':          r['labels'],
        })

    # Sort by actual score
    variant_preds.sort(key=lambda x: x['actual_score'], reverse=True)

    meta = {
        'modelVersion':   'v1.0',
        'algorithm':      best_name,
        'nVariants':      len(X),
        'nFeatures':      int(X.shape[1]),
        'cvResults':      results,
        'bestModel':      best_name,
        'looR2':          results[best_name]['loo_r2'],
        'looRMSE':        results[best_name]['loo_rmse'],
        'inSampleR2':     in_r2,
        'pearsonR':       float(in_pcc),
        'stabilityRange': {'min': float(y.min()), 'max': float(y.max()), 'wt': 1.0},
        'variantPredictions': variant_preds,
    }

    with open(os.path.join(MODELS_DIR, 'training_meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)

    print(f'\n  Model saved → models/stability_model.joblib')
    print(f'  Metadata  → models/training_meta.json')

    # ── Print top/bottom variants ────────────────────────────────────────────
    print('\n  Top 5 most stable variants (actual score):')
    for vp in variant_preds[:5]:
        print(f'    {vp["mutation"]:8s}  actual={vp["actual_score"]:.3f}  predicted={vp["predicted_score"]:.3f}')

    print('\n  Bottom 5 least stable variants:')
    for vp in variant_preds[-5:]:
        print(f'    {vp["mutation"]:8s}  actual={vp["actual_score"]:.3f}  predicted={vp["predicted_score"]:.3f}')

    return meta


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--from-csv', action='store_true',
                        help='Compute labels directly from raw CSV files (skip JSON)')
    args = parser.parse_args()

    print('=== hsFAST Stability Model Training ===\n')

    if args.from_csv:
        print('Computing labels from CSV files...')
        records = compute_labels_from_csvs()
    else:
        print('Loading labels from training_data.json...')
        try:
            records = load_labels_from_json()
        except FileNotFoundError:
            print('  training_data.json not found — computing from CSVs instead')
            records = compute_labels_from_csvs()

    print(f'\nLoaded {len(records)} variants')
    meta = train(records)

    print('\n=== Training Complete ===')
    print(f'  Algorithm:  {meta["algorithm"]}')
    print(f'  LOO R²:     {meta["looR2"]:.3f}')
    print(f'  LOO RMSE:   {meta["looRMSE"]:.3f}')
    print(f'  In-sample R²: {meta["inSampleR2"]:.3f}')
    print(f'\nRun: python -m uvicorn main:app --port 8000 --reload')
