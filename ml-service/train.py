"""
Train the hsFAST stability prediction model.

Usage:
    python train.py                    # train on S1724 ThermoMutDB benchmark (default)
    python train.py --from-csv         # same — reads client-data/benchmarks/S1724_...csv
    python train.py --from-hsfast      # legacy: train on 50-variant hsFAST CSV data
    python train.py --from-dms         # DMS v7 data from client-data/dms/
    python train.py --augment-dms      # S1724 + DMS combined dataset
    python train.py --use-cnn          # include ProtStabCNN in model comparison

Outputs:
    ml-service/models/stability_model.joblib
    ml-service/models/rf_for_uncertainty.joblib
    ml-service/models/cnn_model.joblib      (when CNN is trained)
    ml-service/models/training_meta.json
"""

import argparse, json, math, os, re, sys, time, warnings
from collections import defaultdict
from statistics import mode as stat_mode

import numpy as np
import pandas as pd
from scipy.stats import pearsonr
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import KFold, cross_val_score
from sklearn.metrics import r2_score, mean_squared_error
import joblib

from features import extract, extract_window, AMINO_ACIDS, encode_sst

ROOT       = os.path.join(os.path.dirname(__file__), '..')
DATA_DIR   = os.path.join(os.path.dirname(__file__), 'data')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_DIR,   exist_ok=True)


# ── S1724 ThermoMutDB loader ─────────────────────────────────────────────────

def _protein_offsets(df: pd.DataFrame) -> dict:
    """
    For each PDB protein, find the consensus offset between paper_seq_muts
    position numbering and the actual 1-indexed position in GJR_trim_seq.
    Returns {pdb_id: offset} where seq_idx = paper_pos - 1 + offset.
    """
    per_protein: dict[str, list[int]] = defaultdict(list)

    for _, row in df.iterrows():
        code = str(row.get('paper_seq_muts', '')).strip()
        m = re.match(r'^([A-Z])(\d+)([A-Z])$', code)
        if not m:
            continue
        pos    = int(m.group(2))
        to_aa  = m.group(3)
        seq    = str(row.get('GJR_trim_seq', '')).strip()
        protein = str(row.get('PDB_wild', '')).strip()

        for off in range(-50, 51):
            idx = pos - 1 + off
            if 0 <= idx < len(seq) and seq[idx] == to_aa:
                per_protein[protein].append(off)
                break

    offsets: dict[str, int] = {}
    for prot, vals in per_protein.items():
        try:
            offsets[prot] = stat_mode(vals)
        except Exception:
            offsets[prot] = 0
    return offsets


def load_s1724() -> list[dict]:
    """
    Load the S1724 ThermoMutDB benchmark dataset.
    Returns records with keys: from_aa, to_aa, position, sequence, ddg, mutation.

    ddg convention (S1724): positive = stabilising, negative = destabilising.
    """
    csv_path = os.path.join(
        ROOT, 'client-data', 'benchmarks',
        'S1724_thermomutdb_cleaned_withseq.csv')

    if not os.path.exists(csv_path):
        raise FileNotFoundError(
            f'S1724 CSV not found at {csv_path}\n'
            'Place the file at client-data/benchmarks/')

    df = pd.read_csv(csv_path)
    df = df[df['mutation_type'] == 'Single']
    df = df.dropna(subset=['ddg', 'GJR_trim_seq', 'paper_seq_muts'])

    print(f'  Loaded {len(df)} single-point mutations from S1724')

    offsets = _protein_offsets(df)

    records = []
    skipped = 0
    for _, row in df.iterrows():
        code    = str(row['paper_seq_muts']).strip()
        m       = re.match(r'^([A-Z])(\d+)([A-Z])$', code)
        if not m:
            skipped += 1
            continue

        from_aa  = m.group(1)
        paper_pos = int(m.group(2))
        to_aa    = m.group(3)
        mut_seq  = str(row['GJR_trim_seq']).strip()
        protein  = str(row.get('PDB_wild', '')).strip()
        offset   = offsets.get(protein, 0)
        seq_idx  = paper_pos - 1 + offset   # 0-based index in mut_seq

        if seq_idx < 0 or seq_idx >= len(mut_seq):
            skipped += 1
            continue
        if mut_seq[seq_idx] != to_aa:
            skipped += 1
            continue

        # Reconstruct WT sequence by reverting the mutation
        wt_seq = mut_seq[:seq_idx] + from_aa + mut_seq[seq_idx + 1:]
        pos_1based = seq_idx + 1     # 1-based position used in extract()

        temp_k = float(row['temperature']) if pd.notna(row.get('temperature')) else 298.15
        ph_val = float(row['ph'])          if pd.notna(row.get('ph'))          else 7.0

        # Phase 4 structural features (real values from PDB annotations)
        rsa_val = float(row['rsa']) if pd.notna(row.get('rsa')) else None
        sst_val = str(row['sst']).strip() if pd.notna(row.get('sst')) else None

        records.append({
            'mutation':  f'{from_aa}{pos_1based}{to_aa}',
            'from_aa':   from_aa,
            'to_aa':     to_aa,
            'position':  pos_1based,
            'sequence':  wt_seq,
            'ddg':       float(row['ddg']),
            'protein':   protein,             # Phase 6 — protein group for held-out CV
            'conditions': {
                'temp_norm': (temp_k  - 298.15) / 15.0,
                'ph_norm':   (ph_val  - 7.0)    / 1.5,
            },
            'rsa': rsa_val,                   # Phase 4 — None when missing → proxy used
            'sst': sst_val,                   # Phase 4 — None when missing → Chou-Fasman
        })

    print(f'  Accepted: {len(records)}  |  Skipped (offset/OOB/mismatch): {skipped}')
    return records


# ── Legacy hsFAST loader (50-variant CSV data) ───────────────────────────────

def _exp_decay_hl(times, fluorescences):
    mask = np.array(fluorescences) > 0
    t = np.array(times)[mask]
    F = np.array(fluorescences)[mask]
    if len(t) < 4:
        return None
    try:
        ln_F = np.log(F)
        coeffs = np.polyfit(t, ln_F, 1)
        k = -coeffs[0]
        return float(np.log(2) / k) if k > 1e-9 else None
    except Exception:
        return None


def load_hsfast() -> list[dict]:
    """Load the original 50-variant hsFAST CSV data (legacy)."""
    kin  = pd.read_csv(os.path.join(ROOT, 'denaturation_70C_hsFAST_screen (1).csv'))
    lys  = pd.read_csv(os.path.join(ROOT, 'platereader_lysate_hsFAST_screen_mock data.csv'))
    facs = pd.read_csv(os.path.join(ROOT, 'facs_cell_hsFAST_screen_mock data.csv'))
    for df_ in [kin, lys, facs]:
        df_.columns = df_.columns.str.strip()

    half_lives: dict = {}
    for (sid, _rep), grp in kin.groupby(['Sample_ID', 'Replicate']):
        grp = grp.sort_values('Time_min')
        hl = _exp_decay_hl(grp['Time_min'].tolist(), grp['Fluorescence_RFU'].tolist())
        if hl is not None:
            half_lives.setdefault(sid, []).append(hl)

    wt_hl = float(np.mean(half_lives.get('WT_HSFAST_FUSION', [10.0])))

    lys['norm_rfu'] = lys['Raw_Fluorescence_RFU'] / lys['OD600_Harvest'].replace(0, np.nan)
    wt_lys = float(lys[lys['Sample_ID'] == 'WT_HSFAST_FUSION']['norm_rfu'].dropna().mean() or 1.0)

    facs_ = facs.copy()
    wt_facs = float(facs_[facs_['Sample_ID'] == 'WT_HSFAST_FUSION']['Percent_FAST_Positive'].dropna().mean() or 91.7)

    lys_fc  = {sid: float(grp['norm_rfu'].dropna().mean())
               for sid, grp in lys.groupby('Sample_ID') if len(grp['norm_rfu'].dropna())}
    facs_fc = {sid: float(grp['Percent_FAST_Positive'].dropna().mean())
               for sid, grp in facs_.groupby('Sample_ID') if len(grp['Percent_FAST_Positive'].dropna())}

    variant_meta = {row['Sample_ID']: str(row['Variant_Description']).strip()
                    for _, row in lys[lys['Sample_Class'] == 'Library_Variant'].drop_duplicates('Sample_ID').iterrows()}

    records = []
    for sid, mut_str in variant_meta.items():
        m = re.match(r'^([A-Z])(\d+)([A-Z])$', mut_str)
        if not m:
            continue
        from_aa, pos, to_aa = m.group(1), int(m.group(2)), m.group(3)
        hl_vals   = half_lives.get(sid, [])
        lys_mean  = lys_fc.get(sid)
        facs_mean = facs_fc.get(sid)
        hl_mean   = float(np.mean(hl_vals)) if hl_vals else None

        # Winsorise thermal fold-change to avoid outliers
        hl_fc = min(float(hl_mean / wt_hl), 3.0) if hl_mean else None
        lys_fc_val  = float(lys_mean / wt_lys)  if lys_mean else None
        facs_fc_val = float(facs_mean / wt_facs) if facs_mean else None

        parts, wts = [], []
        if lys_fc_val  is not None: parts.append(lys_fc_val);  wts.append(0.40)
        if facs_fc_val is not None: parts.append(facs_fc_val); wts.append(0.40)
        if hl_fc       is not None: parts.append(hl_fc);       wts.append(0.20)
        if not parts:
            continue
        tw = sum(wts)
        score = sum(p * w for p, w in zip(parts, wts)) / tw
        # Convert fold-change → ddg-like (positive = stabilising)
        # ddg ≈ RT * ln(score)  at 37°C, RT ≈ 0.616 kcal/mol
        ddg = float(0.616 * np.log(max(score, 0.01)))

        records.append({
            'mutation': mut_str, 'from_aa': from_aa, 'to_aa': to_aa,
            'position': pos, 'sequence': '', 'ddg': ddg,
        })

    print(f'  Loaded {len(records)} hsFAST variants')
    return records


# ── DMS v7 loader ─────────────────────────────────────────────────────────────

def load_dms(dms_dir: str = None) -> list[dict]:
    """
    Load Deep Mutational Scanning (DMS v7) data from client-data/dms/.

    Expected CSV columns (any order):
      Required : protein, mutation, sequence, ddg  (kcal/mol, positive=stabilising)
      Optional : rsa, sst, temperature, ph

    One or more CSV files in dms_dir are merged. Rows missing required fields
    or with unparseable mutations are silently skipped.
    """
    if dms_dir is None:
        dms_dir = os.path.join(ROOT, 'client-data', 'dms')

    if not os.path.isdir(dms_dir):
        raise FileNotFoundError(
            f'DMS directory not found: {dms_dir}\n'
            'Place DMS CSV files at client-data/dms/')

    csv_files = [f for f in os.listdir(dms_dir) if f.endswith('.csv')]
    if not csv_files:
        raise FileNotFoundError(f'No CSV files found in {dms_dir}')

    print(f'  Loading DMS data from {len(csv_files)} file(s) in {dms_dir}')
    all_records = []

    for fname in sorted(csv_files):
        path = os.path.join(dms_dir, fname)
        try:
            df = pd.read_csv(path)
        except Exception as exc:
            print(f'    WARN: could not read {fname}: {exc}')
            continue

        df.columns = [c.strip().lower() for c in df.columns]
        required = {'protein', 'mutation', 'sequence', 'ddg'}
        if not required.issubset(set(df.columns)):
            missing = required - set(df.columns)
            print(f'    WARN: {fname} missing columns {missing}, skipping')
            continue

        df = df.dropna(subset=['protein', 'mutation', 'sequence', 'ddg'])
        skipped = 0
        for _, row in df.iterrows():
            code = str(row['mutation']).strip()
            m    = re.match(r'^([A-Z])(\d+)([A-Z])$', code)
            if not m:
                skipped += 1
                continue
            from_aa  = m.group(1)
            pos      = int(m.group(2))
            to_aa    = m.group(3)
            seq      = str(row['sequence']).strip()
            pos_0    = pos - 1
            if pos_0 < 0 or pos_0 >= len(seq):
                skipped += 1
                continue

            rsa_val = float(row['rsa']) if 'rsa' in df.columns and pd.notna(row.get('rsa')) else None
            sst_val = str(row['sst']).strip() if 'sst' in df.columns and pd.notna(row.get('sst')) else None
            temp_k  = float(row['temperature']) if 'temperature' in df.columns and pd.notna(row.get('temperature')) else 298.15
            ph_val  = float(row['ph'])           if 'ph'          in df.columns and pd.notna(row.get('ph'))          else 7.0

            all_records.append({
                'mutation':   code,
                'from_aa':    from_aa,
                'to_aa':      to_aa,
                'position':   pos,
                'sequence':   seq,
                'ddg':        float(row['ddg']),
                'protein':    str(row['protein']).strip(),
                'conditions': {
                    'temp_norm': (temp_k  - 298.15) / 15.0,
                    'ph_norm':   (ph_val  - 7.0)    / 1.5,
                },
                'rsa': rsa_val,
                'sst': sst_val,
                'source': 'dms',
            })

        accepted = len(all_records) - (len(all_records) - len(all_records) + skipped + len(df) - skipped)
        print(f'    {fname}: {len(df) - skipped} accepted, {skipped} skipped')

    print(f'  DMS total: {len(all_records)} variants from {len(csv_files)} file(s)')
    return all_records


# ── ESM-2 masked marginal precomputation ─────────────────────────────────────

def add_esm_scores(records: list[dict]) -> bool:
    """
    Try to compute ESM-2 masked marginal scores for every record in-place.
    Adds 'esm_score' key to each record that could be scored.
    Returns True if any scores were added.
    """
    try:
        from esm_embedder import get_masked_marginals, is_available
    except ImportError:
        print('  esm_embedder not importable — skipping ESM scores')
        return False

    if not is_available():
        print('  ESM-2 not installed — skipping ESM scores (train with torch+transformers for Phase 3)')
        return False

    print('  Computing ESM-2 masked marginals...')
    t0 = time.time()

    # Group by unique non-empty sequence to avoid redundant forward passes
    seq_groups: dict[str, list[dict]] = {}
    for r in records:
        seq = r.get('sequence', '').strip()
        if seq:
            seq_groups.setdefault(seq, []).append(r)

    n_seqs = len(seq_groups)
    print(f'  {n_seqs} unique sequences to embed (model: facebook/esm2_t6_8M_UR50D)')

    scored = 0
    for idx, (seq, recs) in enumerate(seq_groups.items(), 1):
        marginals = get_masked_marginals(seq)
        if marginals is None:
            continue
        for r in recs:
            pos_0   = r['position'] - 1
            lp_to   = marginals.get((pos_0, r['to_aa']),   -20.0)
            lp_from = marginals.get((pos_0, r['from_aa']), -20.0)
            r['esm_score'] = float(lp_to - lp_from)
            scored += 1
        if idx % 5 == 0 or idx == n_seqs:
            elapsed = time.time() - t0
            print(f'    {idx}/{n_seqs} seqs  ({elapsed:.0f}s, {elapsed/idx:.1f}s/seq)')

    total_time = time.time() - t0
    print(f'  ESM scores added for {scored}/{len(records)} variants  ({total_time:.1f}s total)')
    return scored > 0


# ── Build feature matrices ────────────────────────────────────────────────────

def build_dataset(records: list[dict]) -> tuple[np.ndarray, np.ndarray, list[str], np.ndarray]:
    """Build physicochemical feature matrix (60/61-dim) for RF/GB/Ridge."""
    X_rows, y_rows, ids, groups = [], [], [], []
    for r in records:
        feat = extract(
            r['from_aa'], r['to_aa'], r['position'],
            r.get('sequence', ''), r.get('conditions'),
            r.get('esm_score'),        # Phase 3 — None -> 60-dim; float -> 61-dim
            r.get('rsa'),              # Phase 4 — None -> proxy; float -> real
            r.get('sst'),              # Phase 4 — None -> Chou-Fasman; str -> real
        )
        X_rows.append(feat)
        y_rows.append(r['ddg'])
        ids.append(r.get('mutation', ''))
        groups.append(r.get('protein', 'unknown'))
    return (np.array(X_rows, dtype=np.float32),
            np.array(y_rows, dtype=np.float64),
            ids,
            np.array(groups))


def build_window_dataset(records: list[dict]) -> np.ndarray:
    """Build 506-dim sequence-window feature matrix for ProtStabCNN."""
    return np.array([
        extract_window(r['from_aa'], r['to_aa'], r['position'],
                       r.get('sequence', ''))
        for r in records
    ], dtype=np.float32)


# ── Sequence fingerprinting for similarity warning ────────────────────────────

_AA_ORDER = list('ACDEFGHIKLMNPQRSTVWY')

def _aa_composition(seq: str) -> list[float]:
    """20-dim amino acid frequency vector, L2-normalised."""
    if not seq:
        return [0.0] * 20
    counts = [seq.count(aa) for aa in _AA_ORDER]
    total  = sum(counts) or 1
    vec    = [c / total for c in counts]
    norm   = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def build_fingerprints(records: list[dict]) -> list[list[float]]:
    """One normalised AA-composition vector per unique non-empty sequence."""
    seen = set()
    fingerprints = []
    for r in records:
        seq = r.get('sequence', '').strip()
        if seq and seq not in seen:
            seen.add(seq)
            fingerprints.append(_aa_composition(seq))
    return fingerprints


# ── Model training ────────────────────────────────────────────────────────────

def train(records: list[dict], use_cnn: bool = False) -> dict:
    fingerprints = build_fingerprints(records)

    print('\n  Phase 3: ESM-2 masked marginal scores')
    esm_used = add_esm_scores(records)

    X, y, ids, groups = build_dataset(records)
    n = len(X)
    n_proteins = len(set(groups))
    print(f'\n  Training on {n} variants, {X.shape[1]} features, {n_proteins} proteins')
    print(f'  ddG range: {y.min():.3f} - {y.max():.3f} kcal/mol  (WT ~= 0)')

    rf = Pipeline([
        ('scaler', StandardScaler()),
        ('model',  RandomForestRegressor(
            n_estimators=300, max_depth=5, min_samples_leaf=3,
            max_features='sqrt', random_state=42)),
    ])
    gb = Pipeline([
        ('scaler', StandardScaler()),
        ('model',  GradientBoostingRegressor(
            n_estimators=200, max_depth=3, learning_rate=0.05,
            subsample=0.8, random_state=42)),
    ])
    ridge = Pipeline([
        ('scaler', StandardScaler()),
        ('model',  Ridge(alpha=1.0)),
    ])

    from sklearn.model_selection import KFold, GroupKFold, cross_val_predict

    # ── Random 5-fold CV (optimistic — mutations from same protein leak across folds)
    cv_random   = KFold(n_splits=5, shuffle=True, random_state=42)
    # ── Protein-held-out CV (honest: entire proteins held out)
    cv_protein  = GroupKFold(n_splits=5)

    base_models = [('RandomForest', rf), ('GradBoost', gb), ('Ridge', ridge)]

    # ── ProtStabCNN (Phase D Step 10) ─────────────────────────────────────────
    cnn_model_obj  = None
    cnn_results_random  = None
    cnn_results_protein = None

    if use_cnn:
        print('\n  Phase D: Building window features for ProtStabCNN...')
        try:
            from cnn_model import create_protostab_cnn
            X_cnn = build_window_dataset(records)
            print(f'  ProtStabCNN input shape: {X_cnn.shape}')

            cnn = create_protostab_cnn()

            with warnings.catch_warnings():
                warnings.filterwarnings('ignore')
                cv_preds_r = cross_val_predict(cnn, X_cnn, y, cv=cv_random)
                cnn_results_random = {
                    'cv_r2':   float(r2_score(y, cv_preds_r)),
                    'cv_rmse': float(np.sqrt(mean_squared_error(y, cv_preds_r))),
                    'cv_pcc':  float(pearsonr(y, cv_preds_r)[0]),
                }
                cv_preds_p = cross_val_predict(cnn, X_cnn, y, cv=cv_protein, groups=groups)
                cnn_results_protein = {
                    'cv_r2':   float(r2_score(y, cv_preds_p)),
                    'cv_rmse': float(np.sqrt(mean_squared_error(y, cv_preds_p))),
                    'cv_pcc':  float(pearsonr(y, cv_preds_p)[0]),
                }

            print(f'  ProtStabCNN  Random-CV  R²={cnn_results_random["cv_r2"]:.3f}  RMSE={cnn_results_random["cv_rmse"]:.3f}')
            print(f'  ProtStabCNN  Protein-CV R²={cnn_results_protein["cv_r2"]:.3f}  RMSE={cnn_results_protein["cv_rmse"]:.3f}')
            cnn_model_obj = (cnn, X_cnn)
        except Exception as exc:
            print(f'  ProtStabCNN skipped: {exc}')

    print(f'\n  Random 5-Fold CV  (optimistic — same-protein leakage):')
    results_random = {}
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', message='R.2 score is not well-defined')
        for name, model in base_models:
            cv_preds  = cross_val_predict(model, X, y, cv=cv_random)
            cv_rmse   = float(np.sqrt(mean_squared_error(y, cv_preds)))
            cv_r2     = float(r2_score(y, cv_preds))
            cv_pcc, _ = pearsonr(y, cv_preds)
            results_random[name] = {'cv_r2': cv_r2, 'cv_rmse': cv_rmse, 'cv_pcc': float(cv_pcc)}
            print(f'    {name:15s}  R²={cv_r2:.3f}  RMSE={cv_rmse:.3f}  PCC={cv_pcc:.3f}')

    if cnn_results_random:
        results_random['ProtStabCNN'] = cnn_results_random
        print(f'    {"ProtStabCNN":15s}  R²={cnn_results_random["cv_r2"]:.3f}  RMSE={cnn_results_random["cv_rmse"]:.3f}  (window features)')

    print(f'\n  Protein-Held-Out 5-Fold CV  (honest — new-protein generalisation):')
    results_protein = {}
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', message='R.2 score is not well-defined')
        for name, model in base_models:
            cv_preds  = cross_val_predict(model, X, y, cv=cv_protein, groups=groups)
            cv_rmse   = float(np.sqrt(mean_squared_error(y, cv_preds)))
            cv_r2     = float(r2_score(y, cv_preds))
            cv_pcc, _ = pearsonr(y, cv_preds)
            results_protein[name] = {'cv_r2': cv_r2, 'cv_rmse': cv_rmse, 'cv_pcc': float(cv_pcc)}
            print(f'    {name:15s}  R²={cv_r2:.3f}  RMSE={cv_rmse:.3f}  PCC={cv_pcc:.3f}')

    if cnn_results_protein:
        results_protein['ProtStabCNN'] = cnn_results_protein
        print(f'    {"ProtStabCNN":15s}  R²={cnn_results_protein["cv_r2"]:.3f}  RMSE={cnn_results_protein["cv_rmse"]:.3f}  (window features)')

    # Choose best model by protein-held-out R² (honest metric)
    all_protein_r2 = {k: v['cv_r2'] for k, v in results_protein.items()
                      if not math.isnan(v['cv_r2'])}
    best_name = max(all_protein_r2, key=lambda k: all_protein_r2[k])

    model_lookup = {'RandomForest': rf, 'GradBoost': gb, 'Ridge': ridge}
    cnn_is_best  = (best_name == 'ProtStabCNN') and (cnn_model_obj is not None)

    if cnn_is_best:
        best_model = cnn_model_obj[0]
        X_train    = cnn_model_obj[1]
    else:
        best_name  = best_name if best_name in model_lookup else 'GradBoost'
        best_model = model_lookup[best_name]
        X_train    = X

    print(f'\n  Best model (by protein-CV): {best_name}')
    print(f'    Random-CV  R²={results_random[best_name]["cv_r2"]:.3f}  RMSE={results_random[best_name]["cv_rmse"]:.3f}')
    print(f'    Protein-CV R²={results_protein[best_name]["cv_r2"]:.3f}  RMSE={results_protein[best_name]["cv_rmse"]:.3f}')

    best_model.fit(X_train, y)

    y_pred    = best_model.predict(X_train)
    in_r2     = float(r2_score(y, y_pred))
    in_pcc, _ = pearsonr(y, y_pred)
    print(f'  In-sample  R²={in_r2:.3f}  Pearson r={in_pcc:.3f}')

    # Always fit RF (used for uncertainty even if not the best predictor)
    rf.fit(X, y)

    joblib.dump(best_model, os.path.join(MODELS_DIR, 'stability_model.joblib'))
    joblib.dump(rf,         os.path.join(MODELS_DIR, 'rf_for_uncertainty.joblib'))

    # Save CNN separately if trained
    if cnn_model_obj is not None:
        cnn_obj, _ = cnn_model_obj
        if not cnn_is_best:
            cnn_obj.fit(cnn_model_obj[1], y)
        joblib.dump(cnn_obj, os.path.join(MODELS_DIR, 'cnn_model.joblib'))
        print('  CNN model saved -> models/cnn_model.joblib')

    # ── Per-protein stats ─────────────────────────────────────────────────────
    protein_buckets: dict[str, list[float]] = defaultdict(list)
    for r, actual in zip(records, y):
        protein_buckets[r.get('protein', 'unknown')].append(float(actual))

    protein_stats = []
    for prot in sorted(protein_buckets):
        ddgs = protein_buckets[prot]
        protein_stats.append({
            'protein':    prot,
            'nVariants':  len(ddgs),
            'meanDdg':    round(float(np.mean(ddgs)), 3),
            'stdDdg':     round(float(np.std(ddgs)), 3),
            'minDdg':     round(float(np.min(ddgs)), 3),
            'maxDdg':     round(float(np.max(ddgs)), 3),
        })

    # ── Per-variant report ────────────────────────────────────────────────────
    variant_preds = []
    for r, feat_row, actual in zip(records, X_train, y):
        pred = float(best_model.predict(feat_row.reshape(1, -1))[0])
        variant_preds.append({
            'mutation':        r.get('mutation', ''),
            'protein':         r.get('protein', 'unknown'),
            'actual_ddg':      round(float(actual), 4),
            'predicted_ddg':   round(pred, 4),
            'error':           round(abs(pred - float(actual)), 4),
        })

    variant_preds.sort(key=lambda x: x['actual_ddg'], reverse=True)

    if esm_used:
        model_version = 'v5.0-cnn-esm35M' if cnn_is_best else 'v5.0-esm35M'
    else:
        model_version = 'v5.0-cnn' if cnn_is_best else 'v5.0-structural'

    sources = list({r.get('source', 's1724') for r in records})
    n_dms   = sum(1 for r in records if r.get('source') == 'dms')

    meta = {
        'modelVersion':      model_version,
        'algorithm':         best_name,
        'nVariants':         n,
        'nProteins':         n_proteins,
        'nFeatures':         int(X_train.shape[1]),
        # Random CV (optimistic — same-protein leakage)
        'cvLabel':           'Random-5Fold',
        'cvResults':         results_random,
        'looR2':             results_random[best_name]['cv_r2'],
        'looRMSE':           results_random[best_name]['cv_rmse'],
        # Protein-held-out CV (honest — new-protein generalisation)
        'proteinCvLabel':    'Protein-HeldOut-5Fold',
        'proteinCvResults':  results_protein,
        'proteinCvR2':       results_protein[best_name]['cv_r2'],
        'proteinCvRMSE':     results_protein[best_name]['cv_rmse'],
        'proteinCvPCC':      results_protein[best_name]['cv_pcc'],
        'bestModel':         best_name,
        'inSampleR2':        in_r2,
        'pearsonR':          float(in_pcc),
        'stabilityRange': {
            'min': float(y.min()), 'max': float(y.max()),
            'wt': 0.0, 'unit': 'kcal/mol',
            'note': 'positive = stabilising (S1724 convention)',
        },
        'trainingFingerprints':  fingerprints,
        'similarityThreshold':   0.70,
        'esmUsed':               esm_used,
        'cnnUsed':               cnn_is_best,
        'cnnTrained':            cnn_model_obj is not None,
        'dataSources':           sources,
        'nDmsVariants':          n_dms,
        'proteinStats':          protein_stats,
        'variantPredictions':    variant_preds,
    }

    with open(os.path.join(MODELS_DIR, 'training_meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)

    print(f'\n  Model saved  -> models/stability_model.joblib')
    print(f'  Metadata    -> models/training_meta.json')
    print(f'  Fingerprints: {len(fingerprints)} unique training sequences')
    print(f'  Per-protein stats: {len(protein_stats)} proteins')

    print('\n  Top 5 most stabilising mutations (actual ddG):')
    for vp in variant_preds[:5]:
        print(f'    {vp["mutation"]:10s}  actual={vp["actual_ddg"]:+.3f}  predicted={vp["predicted_ddg"]:+.3f}')

    print('\n  Top 5 most destabilising mutations:')
    for vp in variant_preds[-5:]:
        print(f'    {vp["mutation"]:10s}  actual={vp["actual_ddg"]:+.3f}  predicted={vp["predicted_ddg"]:+.3f}')

    return meta


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--from-csv',    action='store_true',
                        help='Train on S1724 ThermoMutDB CSV (default)')
    parser.add_argument('--from-hsfast', action='store_true',
                        help='Legacy: train on 50-variant hsFAST CSV data')
    parser.add_argument('--from-dms',   action='store_true',
                        help='Train on DMS v7 data from client-data/dms/')
    parser.add_argument('--augment-dms', action='store_true',
                        help='Train on S1724 + DMS combined dataset')
    parser.add_argument('--use-cnn',    action='store_true',
                        help='Include ProtStabCNN (MLP) in model comparison')
    args = parser.parse_args()

    print('=== hsFAST Stability Model Training ===\n')

    if args.from_hsfast:
        print('Loading hsFAST 50-variant data...')
        records = load_hsfast()
    elif args.from_dms:
        print('Loading DMS v7 data...')
        records = load_dms()
    elif args.augment_dms:
        print('Loading S1724 + DMS combined dataset...')
        records = load_s1724() + load_dms()
        print(f'  Combined: {len(records)} total variants')
    else:
        print('Loading S1724 ThermoMutDB benchmark...')
        records = load_s1724()

    print(f'\nLoaded {len(records)} training variants')
    meta = train(records, use_cnn=args.use_cnn)

    print('\n=== Training Complete ===')
    print(f'  Version:       {meta["modelVersion"]}')
    print(f'  Algorithm:     {meta["algorithm"]}')
    print(f'  Features:      {meta["nFeatures"]}')
    print(f'  Proteins:      {meta["nProteins"]}')
    print(f'  CNN trained:   {meta.get("cnnTrained", False)}')
    print(f'  CNN is best:   {meta.get("cnnUsed", False)}')
    print(f'  ESM used:      {meta.get("esmUsed", False)}')
    print(f'  Random-CV   R²={meta["looR2"]:.3f}  RMSE={meta["looRMSE"]:.3f} kcal/mol  (inflated — leakage)')
    print(f'  Protein-CV  R²={meta["proteinCvR2"]:.3f}  RMSE={meta["proteinCvRMSE"]:.3f} kcal/mol  (honest)')
    print(f'  In-sample   R²={meta["inSampleR2"]:.3f}')
    print(f'\nRun: python -m uvicorn main:app --port 8000 --reload')
