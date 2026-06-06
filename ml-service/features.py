"""
Mutation feature engineering.
All features are derived from the mutation itself (from_aa, to_aa, position)
and the local sequence context around the mutation site.

Feature vector layout (61 dims max):
  [0-55]  physicochemical (blosum, KD, vol, charge, burial, flags, one-hot)
  [56-58] secondary structure one-hot: [sst_helix, sst_strand, sst_loop]
  [59]    relative solvent accessibility (RSA, 0=buried, 1=surface)
  [60]    esm_masked_marginal (optional — only when model trained with ESM-2)
"""

import numpy as np

AMINO_ACIDS = list('ACDEFGHIKLMNPQRSTVWY')
AA_INDEX = {aa: i for i, aa in enumerate(AMINO_ACIDS)}

# BLOSUM62 matrix
BLOSUM62 = {
    'A': {'A':4,'R':-1,'N':-2,'D':-2,'C':0,'Q':-1,'E':-1,'G':0,'H':-2,'I':-1,'L':-1,'K':-1,'M':-1,'F':-2,'P':-1,'S':1,'T':0,'W':-3,'Y':-2,'V':0},
    'R': {'A':-1,'R':5,'N':0,'D':-2,'C':-3,'Q':1,'E':0,'G':-2,'H':0,'I':-3,'L':-2,'K':2,'M':-1,'F':-3,'P':-2,'S':-1,'T':-1,'W':-3,'Y':-2,'V':-3},
    'N': {'A':-2,'R':0,'N':6,'D':1,'C':-3,'Q':0,'E':0,'G':0,'H':1,'I':-3,'L':-3,'K':0,'M':-2,'F':-3,'P':-2,'S':1,'T':0,'W':-4,'Y':-2,'V':-3},
    'D': {'A':-2,'R':-2,'N':1,'D':6,'C':-3,'Q':0,'E':2,'G':-1,'H':-1,'I':-3,'L':-4,'K':-1,'M':-3,'F':-3,'P':-1,'S':0,'T':-1,'W':-4,'Y':-3,'V':-3},
    'C': {'A':0,'R':-3,'N':-3,'D':-3,'C':9,'Q':-3,'E':-4,'G':-3,'H':-3,'I':-1,'L':-1,'K':-3,'M':-1,'F':-2,'P':-3,'S':-1,'T':-1,'W':-2,'Y':-2,'V':-1},
    'Q': {'A':-1,'R':1,'N':0,'D':0,'C':-3,'Q':5,'E':2,'G':-2,'H':0,'I':-3,'L':-2,'K':1,'M':0,'F':-3,'P':-1,'S':0,'T':-1,'W':-2,'Y':-1,'V':-2},
    'E': {'A':-1,'R':0,'N':0,'D':2,'C':-4,'Q':2,'E':5,'G':-2,'H':0,'I':-3,'L':-3,'K':1,'M':-2,'F':-3,'P':-1,'S':0,'T':-1,'W':-3,'Y':-2,'V':-2},
    'G': {'A':0,'R':-2,'N':0,'D':-1,'C':-3,'Q':-2,'E':-2,'G':6,'H':-2,'I':-4,'L':-4,'K':-2,'M':-3,'F':-3,'P':-2,'S':0,'T':-2,'W':-2,'Y':-3,'V':-3},
    'H': {'A':-2,'R':0,'N':1,'D':-1,'C':-3,'Q':0,'E':0,'G':-2,'H':8,'I':-3,'L':-3,'K':-1,'M':-2,'F':-1,'P':-2,'S':-1,'T':-2,'W':-2,'Y':2,'V':-3},
    'I': {'A':-1,'R':-3,'N':-3,'D':-3,'C':-1,'Q':-3,'E':-3,'G':-4,'H':-3,'I':4,'L':2,'K':-3,'M':1,'F':0,'P':-3,'S':-2,'T':-1,'W':-3,'Y':-1,'V':3},
    'L': {'A':-1,'R':-2,'N':-3,'D':-4,'C':-1,'Q':-2,'E':-3,'G':-4,'H':-3,'I':2,'L':4,'K':-2,'M':2,'F':0,'P':-3,'S':-2,'T':-1,'W':-2,'Y':-1,'V':1},
    'K': {'A':-1,'R':2,'N':0,'D':-1,'C':-3,'Q':1,'E':1,'G':-2,'H':-1,'I':-3,'L':-2,'K':5,'M':-1,'F':-3,'P':-1,'S':0,'T':-1,'W':-3,'Y':-2,'V':-2},
    'M': {'A':-1,'R':-1,'N':-2,'D':-3,'C':-1,'Q':0,'E':-2,'G':-3,'H':-2,'I':1,'L':2,'K':-1,'M':5,'F':0,'P':-2,'S':-1,'T':-1,'W':-1,'Y':-1,'V':1},
    'F': {'A':-2,'R':-3,'N':-3,'D':-3,'C':-2,'Q':-3,'E':-3,'G':-3,'H':-1,'I':0,'L':0,'K':-3,'M':0,'F':6,'P':-4,'S':-2,'T':-2,'W':1,'Y':3,'V':-1},
    'P': {'A':-1,'R':-2,'N':-2,'D':-1,'C':-3,'Q':-1,'E':-1,'G':-2,'H':-2,'I':-3,'L':-3,'K':-1,'M':-2,'F':-4,'P':7,'S':-1,'T':-1,'W':-4,'Y':-3,'V':-2},
    'S': {'A':1,'R':-1,'N':1,'D':0,'C':-1,'Q':0,'E':0,'G':0,'H':-1,'I':-2,'L':-2,'K':0,'M':-1,'F':-2,'P':-1,'S':4,'T':1,'W':-3,'Y':-2,'V':-2},
    'T': {'A':0,'R':-1,'N':0,'D':-1,'C':-1,'Q':-1,'E':-1,'G':-2,'H':-2,'I':-1,'L':-1,'K':-1,'M':-1,'F':-2,'P':-1,'S':1,'T':5,'W':-2,'Y':-2,'V':0},
    'W': {'A':-3,'R':-3,'N':-4,'D':-4,'C':-2,'Q':-2,'E':-3,'G':-2,'H':-2,'I':-3,'L':-2,'K':-3,'M':-1,'F':1,'P':-4,'S':-3,'T':-2,'W':11,'Y':2,'V':-3},
    'Y': {'A':-2,'R':-2,'N':-2,'D':-3,'C':-2,'Q':-1,'E':-2,'G':-3,'H':2,'I':-1,'L':-1,'K':-2,'M':-1,'F':3,'P':-3,'S':-2,'T':-2,'W':2,'Y':7,'V':-1},
    'V': {'A':0,'R':-3,'N':-3,'D':-3,'C':-1,'Q':-2,'E':-2,'G':-3,'H':-3,'I':3,'L':1,'K':-2,'M':1,'F':-1,'P':-2,'S':-2,'T':0,'W':-3,'Y':-1,'V':4},
}

# Kyte-Doolittle hydrophobicity
KD = {
    'A':1.8,'R':-4.5,'N':-3.5,'D':-3.5,'C':2.5,'Q':-3.5,'E':-3.5,'G':-0.4,
    'H':-3.2,'I':4.5,'L':3.8,'K':-3.9,'M':1.9,'F':2.8,'P':-1.6,'S':-0.8,
    'T':-0.7,'W':-0.9,'Y':-1.3,'V':4.2,
}

# Residue volumes (Å³)
VOL = {
    'A':88.6,'R':173.4,'N':114.1,'D':111.1,'C':108.5,'Q':143.8,'E':138.4,'G':60.1,
    'H':153.2,'I':166.7,'L':166.7,'K':168.6,'M':162.9,'F':189.9,'P':112.7,'S':89.0,
    'T':116.1,'W':227.8,'Y':193.6,'V':140.0,
}

# Net charge at pH 7
CHARGE = {
    'A':0,'R':1,'N':0,'D':-1,'C':0,'Q':0,'E':-1,'G':0,'H':0.1,'I':0,
    'L':0,'K':1,'M':0,'F':0,'P':0,'S':0,'T':0,'W':0,'Y':0,'V':0,
}

# Chou-Fasman helix (Pα) and strand (Pβ) propensities (original 1974 values)
HELIX_PROP = {
    'A':1.42,'R':0.98,'N':0.67,'D':1.01,'C':0.70,'Q':1.11,'E':1.51,'G':0.57,
    'H':1.00,'I':1.08,'L':1.21,'K':1.16,'M':1.45,'F':1.13,'P':0.57,'S':0.77,
    'T':0.83,'W':1.08,'Y':0.69,'V':1.06,
}
STRAND_PROP = {
    'A':0.83,'R':0.93,'N':0.89,'D':0.54,'C':1.19,'Q':1.10,'E':0.37,'G':0.75,
    'H':0.87,'I':1.60,'L':1.30,'K':0.74,'M':1.05,'F':1.38,'P':0.55,'S':0.75,
    'T':1.19,'W':1.37,'Y':1.47,'V':1.70,
}

# SST canonical names → class index (0=helix, 1=strand, 2=loop)
_SST_MAP = {
    'alphahelix': 0, '3-10helix': 0,
    'strand': 1, 'isolatedbeta-bridge': 1,
    'turn': 2, 'bend': 2,
}

# Condition normalisation constants
TEMP_REF_K  = 298.15
TEMP_SCALE  = 15.0
PH_REF      = 7.0
PH_SCALE    = 1.5

FEATURE_NAMES = (
    ['blosum62', 'delta_kd', 'delta_vol', 'delta_charge', 'burial_score',
     'is_pro_to', 'is_gly_to', 'is_cys_from', 'is_pro_from', 'is_gly_from',
     'abs_delta_kd', 'abs_delta_vol', 'abs_delta_charge', 'position_frac',
     'temp_norm', 'ph_norm']
    + [f'from_{aa}' for aa in AMINO_ACIDS]
    + [f'to_{aa}'   for aa in AMINO_ACIDS]
    + ['sst_helix', 'sst_strand', 'sst_loop']  # Phase 4 — real from S1724 or Chou-Fasman proxy
    + ['rsa']                                   # Phase 4 — real from S1724 or burial-score proxy
    + ['esm_masked_marginal']                   # Phase 3 — only when ESM-2 was available at training
)


# ── Structural feature helpers ────────────────────────────────────────────────

def burial_score(seq: str, pos: int, window: int = 4) -> float:
    """KD average of window neighbours — approximates hydrophobic burial."""
    vals = []
    for i in range(max(0, pos - window), min(len(seq), pos + window + 1)):
        if i != pos:
            vals.append(KD.get(seq[i], 0.0))
    return float(np.mean(vals)) if vals else 0.0


def encode_sst(sst_str: str | None) -> list[float]:
    """
    Map a canonical SST string (e.g. 'AlphaHelix') to one-hot [helix, strand, loop].
    Unknown/None defaults to loop.
    """
    if sst_str is None:
        return [0.0, 0.0, 1.0]
    idx = _SST_MAP.get(sst_str.lower().replace(' ', ''), 2)
    oh = [0.0, 0.0, 0.0]
    oh[idx] = 1.0
    return oh


def predict_sst(seq: str, pos: int, window: int = 7) -> list[float]:
    """
    Chou-Fasman window-average secondary structure prediction.
    Returns one-hot [helix, strand, loop].
    ~70% 3-class accuracy — used as inference-time proxy when real SST unavailable.
    """
    start = max(0, pos - window // 2)
    end   = min(len(seq), pos + window // 2 + 1)
    window_seq = seq[start:end]
    if not window_seq:
        return [0.0, 0.0, 1.0]

    avg_h = float(np.mean([HELIX_PROP.get(aa, 1.0)  for aa in window_seq]))
    avg_s = float(np.mean([STRAND_PROP.get(aa, 1.0) for aa in window_seq]))

    if avg_h >= avg_s and avg_h > 1.0:
        return [1.0, 0.0, 0.0]
    if avg_s > avg_h and avg_s > 1.0:
        return [0.0, 1.0, 0.0]
    return [0.0, 0.0, 1.0]


def approx_rsa(burial: float) -> float:
    """
    Sequence-based RSA proxy: sigmoid of negated KD-burial score.
    burial > 0 (hydrophobic context) → lower RSA (more buried).
    Returns float in ~(0.15, 0.85).
    """
    return float(1.0 / (1.0 + np.exp(burial * 0.8)))


# ── Main feature extractor ────────────────────────────────────────────────────

def extract(from_aa: str, to_aa: str, position: int,
            sequence: str = '', conditions: dict = None,
            esm_score: float | None = None,
            rsa: float | None = None,
            sst: str | None = None) -> np.ndarray:
    """
    Returns a 1-D feature vector for one single-point mutation.

    Phase 1-2 (always):
      56 physicochemical features (BLOSUM62, KD, volume, charge, burial, flags, one-hot AA)
    Phase 4 (always, real or proxied):
      sst_helix / sst_strand / sst_loop  — from S1724 CSV or Chou-Fasman proxy at inference
      rsa                                — from S1724 CSV or burial-score sigmoid proxy
    Phase 3 (optional):
      esm_masked_marginal  — only when model trained with ESM-2 (None → omit, keeps 60-dim)

    conditions keys (pre-normalised by caller):
      temp_norm  — (T_kelvin - 298.15) / 15.0
      ph_norm    — (pH - 7.0) / 1.5
    """
    blosum  = BLOSUM62.get(from_aa, {}).get(to_aa, -4)
    d_kd    = KD.get(to_aa, 0.0)    - KD.get(from_aa, 0.0)
    d_vol   = VOL.get(to_aa, 110.0)  - VOL.get(from_aa, 110.0)
    d_chg   = CHARGE.get(to_aa, 0.0) - CHARGE.get(from_aa, 0.0)

    pos_in_seq = position - 1  # 0-based
    burial   = burial_score(sequence, pos_in_seq) if sequence else 0.0
    pos_frac = position / max(len(sequence), 1)   if sequence else 0.5

    cond      = conditions or {}
    temp_norm = float(cond.get('temp_norm', 0.0))
    ph_norm   = float(cond.get('ph_norm',   0.0))

    from_oh = [1.0 if aa == from_aa else 0.0 for aa in AMINO_ACIDS]
    to_oh   = [1.0 if aa == to_aa   else 0.0 for aa in AMINO_ACIDS]

    # Phase 4 structural features
    sst_vec = encode_sst(sst) if sst is not None else predict_sst(sequence, pos_in_seq)
    rsa_val = float(rsa)       if rsa is not None else approx_rsa(burial)

    vec = [
        float(blosum),
        d_kd,
        d_vol,
        d_chg,
        burial,
        float(to_aa == 'P'),
        float(to_aa == 'G'),
        float(from_aa == 'C'),
        float(from_aa == 'P'),
        float(from_aa == 'G'),
        abs(d_kd),
        abs(d_vol),
        abs(d_chg),
        pos_frac,
        temp_norm,
        ph_norm,
    ] + from_oh + to_oh + sst_vec + [rsa_val]   # 60 dims

    if esm_score is not None:
        vec.append(float(esm_score))             # 61st dim

    return np.array(vec, dtype=np.float32)


def feature_matrix(mutations: list[tuple], sequence: str = '',
                   conditions: dict = None) -> np.ndarray:
    """mutations: list of (from_aa, to_aa, position) tuples"""
    return np.vstack([extract(f, t, p, sequence, conditions) for f, t, p in mutations])
