"""
ESM-2 masked marginal scoring for mutation effect prediction.

For each mutation (from_aa -> to_aa at position i):
  score = log P(to_aa | context_masked_at_i) - log P(from_aa | context_masked_at_i)

Positive score: ESM-2 prefers the mutant AA given the surrounding context.
Correlates with experimental ddG (Meier et al. 2021, ESM-1v).

Phase D (Step 12): Upgraded to facebook/esm2_t12_35M_UR50D (35M params, 480-dim).
  ~3× more parameters than the 8M model; better cross-protein generalisation.
  Override via env var: ESM_MODEL_NAME=facebook/esm2_t6_8M_UR50D (for CPU-only)

Falls back gracefully to score=0.0 if torch/transformers not installed.
"""

import logging, os
from typing import Optional

logger = logging.getLogger(__name__)

# Phase D Step 12: 35M model; configurable via env var for low-memory machines
_DEFAULT_ESM_MODEL = 'facebook/esm2_t12_35M_UR50D'
ESM_MODEL_NAME     = os.environ.get('ESM_MODEL_NAME', _DEFAULT_ESM_MODEL)
BATCH_SIZE         = 16          # reduced from 32: 35M model uses more VRAM
AMINO_ACIDS    = list('ACDEFGHIKLMNPQRSTVWY')

_load_attempted = False
_ESM_AVAILABLE  = False
_model          = None
_tokenizer      = None
_aa_token_ids   = None


def _try_load() -> bool:
    global _ESM_AVAILABLE, _model, _tokenizer, _aa_token_ids, _load_attempted
    if _load_attempted:
        return _ESM_AVAILABLE
    _load_attempted = True
    try:
        import torch                                             # noqa: F401
        from transformers import EsmForMaskedLM, EsmTokenizer

        logger.info('Loading %s ...', ESM_MODEL_NAME)
        _tokenizer    = EsmTokenizer.from_pretrained(ESM_MODEL_NAME)
        _model        = EsmForMaskedLM.from_pretrained(ESM_MODEL_NAME)
        _model.eval()
        _aa_token_ids = {aa: _tokenizer.convert_tokens_to_ids(aa) for aa in AMINO_ACIDS}
        _ESM_AVAILABLE = True
        logger.info('ESM-2 loaded.')
        return True
    except Exception as exc:
        logger.warning('ESM-2 unavailable (%s) — esm_masked_marginal will be 0.0.', exc)
        return False


def is_available() -> bool:
    return _try_load()


def get_masked_marginals(sequence: str) -> Optional[dict]:
    """
    Run batched masked-LM inference: for every position i, mask it and record
    log P(AA | context) for all 20 canonical AAs.

    Returns  dict[(pos_0based: int, aa: str)] -> float
    or       None if ESM-2 is unavailable.

    All L masked sequences have identical length so no padding is added —
    the token at index (pos + 1) in each output is always the masked position
    (ESM tokenizer inserts <cls> at index 0).
    """
    if not _try_load():
        return None

    import torch
    import torch.nn.functional as F

    seq  = sequence.upper()
    L    = len(seq)
    mask = _tokenizer.mask_token

    masked_seqs = [seq[:i] + mask + seq[i + 1:] for i in range(L)]
    scores: dict = {}

    for batch_start in range(0, L, BATCH_SIZE):
        batch          = masked_seqs[batch_start: batch_start + BATCH_SIZE]
        batch_pos_orig = list(range(batch_start, batch_start + len(batch)))

        inputs = _tokenizer(batch, return_tensors='pt', padding=True,
                            add_special_tokens=True)

        with torch.no_grad():
            logits = _model(**inputs).logits      # (B, T, vocab)

        for j, pos in enumerate(batch_pos_orig):
            token_pos = pos + 1                   # +1 for <cls>
            log_probs = F.log_softmax(logits[j, token_pos, :], dim=-1)
            for aa in AMINO_ACIDS:
                scores[(pos, aa)] = float(log_probs[_aa_token_ids[aa]])

    return scores


def masked_marginal_score(sequence: str, pos_0based: int,
                           from_aa: str, to_aa: str,
                           precomputed: Optional[dict] = None) -> float:
    """
    Convenience wrapper: returns log P(to_aa|ctx) - log P(from_aa|ctx).
    Pass precomputed=get_masked_marginals(sequence) to reuse across mutations.
    """
    data = precomputed if precomputed is not None else get_masked_marginals(sequence)
    if data is None:
        return 0.0
    lp_to   = data.get((pos_0based, to_aa),   -20.0)
    lp_from = data.get((pos_0based, from_aa),  -20.0)
    return float(lp_to - lp_from)
