"""
Mutation feature engineering.
All features are derived from the mutation itself (from_aa, to_aa, position)
and the local sequence context around the mutation site.
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

FEATURE_NAMES = (
    ['blosum62', 'delta_kd', 'delta_vol', 'delta_charge', 'burial_score',
     'is_pro_to', 'is_gly_to', 'is_cys_from', 'is_pro_from', 'is_gly_from',
     'abs_delta_kd', 'abs_delta_vol', 'abs_delta_charge', 'position_frac']
    + [f'from_{aa}' for aa in AMINO_ACIDS]
    + [f'to_{aa}'   for aa in AMINO_ACIDS]
)


def burial_score(seq: str, pos: int, window: int = 4) -> float:
    """KD average of window neighbours — approximates hydrophobic burial."""
    vals = []
    for i in range(max(0, pos - window), min(len(seq), pos + window + 1)):
        if i != pos:
            vals.append(KD.get(seq[i], 0.0))
    return float(np.mean(vals)) if vals else 0.0


def extract(from_aa: str, to_aa: str, position: int, sequence: str = '') -> np.ndarray:
    """
    Returns a 1-D feature vector for one single-point mutation.
    `sequence` is optional; if provided, a burial heuristic is included.
    """
    blosum  = BLOSUM62.get(from_aa, {}).get(to_aa, -4)
    d_kd    = KD.get(to_aa, 0.0)    - KD.get(from_aa, 0.0)
    d_vol   = VOL.get(to_aa, 110.0)  - VOL.get(from_aa, 110.0)
    d_chg   = CHARGE.get(to_aa, 0.0) - CHARGE.get(from_aa, 0.0)

    pos_in_seq = position - 1  # 0-based
    burial = burial_score(sequence, pos_in_seq) if sequence else 0.0

    pos_frac = position / max(len(sequence), 1) if sequence else 0.5

    from_oh = [1.0 if aa == from_aa else 0.0 for aa in AMINO_ACIDS]
    to_oh   = [1.0 if aa == to_aa   else 0.0 for aa in AMINO_ACIDS]

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
    ] + from_oh + to_oh

    return np.array(vec, dtype=np.float32)


def feature_matrix(mutations: list[tuple], sequence: str = '') -> np.ndarray:
    """
    mutations: list of (from_aa, to_aa, position) tuples
    Returns shape (n_mutations, n_features)
    """
    return np.vstack([extract(f, t, p, sequence) for f, t, p in mutations])
