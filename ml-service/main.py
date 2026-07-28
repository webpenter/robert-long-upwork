"""
hsFAST ML Service — FastAPI
Serves the ProtStabCNN model (pre-trained on DMSv4, 455k sequences).

Endpoints:
  POST /predict          - predict ΔG for a single protein sequence
  POST /predict/batch    - predict ΔG for up to 100 sequences
  GET  /predict/quick    - quick GET for browser testing
  GET  /health           - liveness + model status
  GET  /model/info       - architecture + training metadata
  GET  /dataset/stats    - training dataset statistics (for Dataset Explorer UI)
  POST /train            - trigger retraining (Phase G — requires dataset import)
"""

import hashlib
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import torch
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────

MODELS_DIR     = Path(__file__).parent / "models"
# ML_CHECKPOINT_PATH lets a specific checkpoint (e.g. the experimental gated
# model) be loaded for local testing without touching the deployed default.
CHECKPOINT     = Path(os.environ.get("ML_CHECKPOINT_PATH") or (MODELS_DIR / "best_model.pt"))
DEVICE         = "cuda" if torch.cuda.is_available() else "cpu"
VALID_AAS      = set("ACDEFGHIKLMNPQRSTVWYX")

_model  = None   # loaded at startup
_meta   = {}     # checkpoint metadata (model_type, model_name, val_metrics)
_family = "cnn"  # 'cnn' | 'esm2_lora' | 'esm2_gated' — see protstab_predict._detect_family


_SCALAR_VAL_METRIC_KEYS = ("mae", "rmse", "pearson_r", "spearman_rho", "accuracy")


def _clean_val_metrics(val_metrics):
    """Drop non-scalar entries (e.g. raw preds/targets arrays some checkpoints
    embed) that aren't JSON-serializable and are too large to return anyway."""
    if not isinstance(val_metrics, dict):
        return val_metrics
    return {k: v for k, v in val_metrics.items() if k in _SCALAR_VAL_METRIC_KEYS}


def _read_meta() -> dict:
    """Read lightweight metadata from the checkpoint without keeping it in memory."""
    try:
        ckpt = torch.load(str(CHECKPOINT), map_location="cpu", weights_only=False)
        if isinstance(ckpt, dict):
            meta = {k: ckpt[k] for k in ("model_type", "model_name", "epoch", "val_metrics") if k in ckpt}
            if "val_metrics" in meta:
                meta["val_metrics"] = _clean_val_metrics(meta["val_metrics"])
            return meta
    except Exception:
        pass
    return {}


def _active_model_name() -> str:
    """Real name of the loaded model — stored by the backend as modelVersion."""
    if _family == "esm2_gated":
        return _meta.get("model_name", "esm2_t30_150M_lora_gated")
    if _family == "esm2_lora":
        return _meta.get("model_name", "esm2_t12_35M_lora")
    return "protstab_cnn_v0"


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model, _meta, _family
    try:
        from protstab_predict import load_model, _detect_family
        _meta  = _read_meta()
        ckpt_for_detect = torch.load(str(CHECKPOINT), map_location="cpu", weights_only=False)
        _family = _detect_family(ckpt_for_detect)
        del ckpt_for_detect
        _model = load_model(str(CHECKPOINT), DEVICE)
        kind = _family
        print(f"[ml-service] Model loaded        : {_model.__class__.__name__} ({kind})")
        print(f"[ml-service] Checkpoint          : {CHECKPOINT}")
        print(f"[ml-service] Device              : {DEVICE}")
        print(f"[ml-service] Trainable params    : {_model.count_parameters():,}")
        if _meta.get("val_metrics"):
            print(f"[ml-service] Val metrics         : {_meta['val_metrics']}")
    except Exception as e:
        print(f"[ml-service] WARNING: could not load model — {e}")
        _model = None
    yield
    _model = None


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="hsFAST ML Service",
    description="Protein thermodynamic stability (ΔG) prediction — ProtStabCNN v0",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4000", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    # Accept both "seq" (client's original API) and "sequence" (our legacy field)
    seq:          Optional[str] = None
    sequence:     Optional[str] = None
    model_name:   str           = "protstab_cnn_v0"
    # Legacy fields from old API — accepted but ignored by CNN
    conditions:   dict          = {}
    tier:         str           = "GOLD"
    predictionId: str           = ""


class PredictResponse(BaseModel):
    dg:          float
    stability:   str
    seq_len:     int
    truncated:   bool
    model_name:  str
    device:      str
    latency_ms:  float


class BatchItem(BaseModel):
    id:  str
    seq: str


class BatchRequest(BaseModel):
    sequences:  list[BatchItem]
    model_name: str = "protstab_cnn_v0"


class BatchResultItem(BaseModel):
    id:        str
    dg:        Optional[float]
    stability: Optional[str]
    seq_len:   Optional[int]
    error:     Optional[str]


class BatchResponse(BaseModel):
    results:    list[BatchResultItem]
    model_name: str
    device:     str
    latency_ms: float


# ── Helpers ───────────────────────────────────────────────────────────────────

def _active_max_aa() -> int:
    """Residue cap of the loaded model. ESM2-LoRA r16 was trained at 80 aa;
    ESM2-gated r32 placeholder is 512 (UNCONFIRMED, see esm2_gated_model.py); CNN uses 256."""
    if _family == "esm2_gated":
        from esm2_gated_model import MAX_LEN as GATED_MAX
        return GATED_MAX
    if _family == "esm2_lora":
        from esm2_lora_model import MAX_LEN as ESM2_MAX
        return ESM2_MAX
    from protstab_model import MAX_LEN as CNN_MAX
    return CNN_MAX


def _clean_seq(raw: str) -> tuple[str, bool]:
    """Strip FASTA headers, whitespace, uppercase. Returns (seq, truncated)."""
    max_aa = _active_max_aa()
    seq = raw
    seq = "\n".join(l for l in seq.splitlines() if not l.startswith(">"))
    seq = seq.upper().replace(" ", "").replace("\n", "").replace("\r", "")
    truncated = len(seq) > max_aa
    return seq[:max_aa], truncated


def _require_model():
    if _model is None:
        raise HTTPException(503, "Model not loaded. Check ml-service startup logs.")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":             "ok",
        "model_loaded":       _model is not None,
        "checkpoint_exists":  CHECKPOINT.exists(),
        "device":             DEVICE,
        "service":            "hsFAST ML Service v2.0",
    }


@app.get("/model/info")
def model_info():
    _require_model()
    if _family == "esm2_gated":
        return {
            "name":          _meta.get("model_name", "esm2_t30_150M_lora_gated"),
            "model_type":    "esm2_gated",
            "architecture":  "ESM2-150M (facebook/esm2_t30_150M_UR50D) + LoRA r=32 on "
                             "q/k/v/dense, masked-mean pool → Linear(640→64) gated by "
                             "temperature/pH → MLP(64→32→1)",
            "parameters":    _model.count_parameters(),
            "max_len":       _active_max_aa(),
            "usesConditions": True,
            "input":         f"tokenized protein sequence (first {_active_max_aa()} aa, "
                             "UNCONFIRMED truncation length) + temperature/pH conditions",
            "output":        "ΔG (kcal/mol) — more negative = more stable (platform convention)",
            "training_data": "author-supplied (not yet documented in this repo)",
            "val_metrics":   _meta.get("val_metrics"),
            "epoch":         _meta.get("epoch"),
            "phase":         "EXPERIMENTAL — env-conditioned model, not yet verified "
                             "(see esm2_gated_model.py for open questions)",
        }
    if _family == "esm2_lora":
        return {
            "name":          _meta.get("model_name", "esm2_t12_35M_lora"),
            "model_type":    "esm2_lora",
            "architecture":  "ESM2-35M (facebook/esm2_t12_35M_UR50D) + LoRA r=16 on q/k/v, "
                             "masked-mean pool → LayerNorm → MLP(480→256→64→1)",
            "parameters":    _model.count_parameters(),       # trainable (LoRA + head)
            "max_len":       _active_max_aa(),
            "usesConditions": False,
            "input":         "tokenized protein sequence, first 80 aa (small-domain scope)",
            "output":        "ΔG (kcal/mol) — more negative = more stable (platform convention)",
            "training_data": "~3.3M small-domain sequences (DMSv4/v5/v7 + Megascale DMS + MGnify)",
            "val_metrics":   _meta.get("val_metrics"),
            "epoch":         _meta.get("epoch"),
            "phase":         "ESM2-35M LoRA r16 fine-tune",
        }
    return {
        "name":          "protstab_cnn_v0",
        "model_type":    "cnn",
        "architecture":  "1D CNN — 3 ConvBlocks (21→64→128→256, k=5/5/3) + GlobalAvgPool + MLP(256→128→32→1)",
        "parameters":    _model.count_parameters(),
        "max_len":       _active_max_aa(),
        "usesConditions": False,
        "input":         "one-hot protein sequence, max 256 aa",
        "output":        "ΔG (kcal/mol) — positive = stable, negative = unstable",
        "training_data": "DMSv4 filtered (455,589 sequences)",
        "phase":         "Phase 1 prototype — ESM2-35M fine-tune planned for Phase 2",
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    _require_model()
    from protstab_predict import predict_one, stability_label

    raw = req.seq or req.sequence or ""
    if not raw.strip():
        raise HTTPException(400, "Provide 'seq' or 'sequence' field with an amino acid sequence")

    seq, truncated = _clean_seq(raw)
    if len(seq) < 10:
        raise HTTPException(400, "Sequence too short (minimum 10 amino acids)")

    bad = set(seq) - VALID_AAS
    if bad:
        raise HTTPException(400, f"Invalid amino acid characters: {sorted(bad)}")

    t0  = time.perf_counter()
    # Client convention: NEGATIVE ΔG = more stable. The model is trained on dmsv4
    # `deltaG` (positive = more stable), so we negate at the API boundary so every
    # downstream consumer (DB, CSV, dashboard, chat) is consistent. Displayed ΔG
    # therefore equals -(dmsv4 deltaG). Assumed to also hold for esm2_gated —
    # unverified, see esm2_gated_model.py.
    dg  = round(-predict_one(seq, _model, DEVICE, conditions=req.conditions), 4)
    ms  = round((time.perf_counter() - t0) * 1000, 2)

    return PredictResponse(
        dg=dg,
        stability=stability_label(dg),
        seq_len=len(seq),
        truncated=truncated,
        model_name=_active_model_name(),
        device=DEVICE,
        latency_ms=ms,
    )


@app.post("/predict/batch", response_model=BatchResponse)
def predict_batch_endpoint(req: BatchRequest):
    if len(req.sequences) > 100:
        raise HTTPException(400, "Maximum 100 sequences per batch request")
    _require_model()
    from protstab_predict import predict_one, stability_label

    t0      = time.perf_counter()
    results = []

    for item in req.sequences:
        try:
            seq, _ = _clean_seq(item.seq)
            if len(seq) < 10:
                raise ValueError(f"Sequence too short ({len(seq)} aa, minimum 10)")
            bad = set(seq) - VALID_AAS
            if bad:
                raise ValueError(f"Invalid characters: {sorted(bad)}")
            dg = round(-predict_one(seq, _model, DEVICE), 4)  # negate: negative ΔG = more stable
            results.append(BatchResultItem(
                id=item.id, dg=dg, stability=stability_label(dg),
                seq_len=len(seq), error=None,
            ))
        except Exception as e:
            results.append(BatchResultItem(
                id=item.id, dg=None, stability=None, seq_len=None, error=str(e),
            ))

    ms = round((time.perf_counter() - t0) * 1000, 2)
    return BatchResponse(
        results=results, model_name=_active_model_name(), device=DEVICE, latency_ms=ms,
    )


@app.get("/predict/quick")
def predict_quick(seq: str = Query(..., description="Amino acid sequence")):
    """Quick GET endpoint for browser/curl testing."""
    _require_model()
    from protstab_predict import predict_one, stability_label

    seq_clean, truncated = _clean_seq(seq)
    if len(seq_clean) < 10:
        raise HTTPException(400, "Sequence too short (minimum 10 amino acids)")
    bad = set(seq_clean) - VALID_AAS
    if bad:
        raise HTTPException(400, f"Invalid characters: {sorted(bad)}")

    t0 = time.perf_counter()
    dg = round(-predict_one(seq_clean, _model, DEVICE), 4)  # negate: negative ΔG = more stable
    ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "seq": seq_clean, "dg": dg, "stability": stability_label(dg),
        "seq_len": len(seq_clean), "truncated": truncated, "latency_ms": ms,
    }


# ── Residue-level stabilizing-mutation scan ──────────────────────────────────
# Given a sequence, score every position × substitution and rank by ΔΔG.
# Convention (client): more negative ΔG = more stable → NEGATIVE ΔΔG = STABILISING.
#
# NOTE (Phase 0, 2026-07): per client direction, the suggestion list + confidence
# scores are a FAST HEURISTIC placeholder — they drive the demo GUI but are NOT yet
# data-backed. This replaces the previous per-mutant ESM2 forward-pass scan, which
# was correct-in-spirit but ran hundreds of inferences per request (minutes on a
# free CPU). The data-backed residue model returns in Phase 3 (see _heuristic_ddg).

AA20 = "ACDEFGHIKLMNPQRSTVWY"

# Placeholder residue "stability propensity" (GUI demo only, NOT data-backed).
# Higher = tends to favour a well-packed/stable fold. Blends hydrophobicity and
# secondary-structure/turn propensity so synthesized ΔΔGs look plausible.
_STAB_PROPENSITY = {
    'A': 0.4, 'C': 0.6, 'D': -0.3, 'E': -0.1, 'F': 0.7, 'G': -0.6, 'H': 0.1,
    'I': 0.8, 'K': -0.2, 'L': 0.8, 'M': 0.5, 'N': -0.3, 'P': -0.7, 'Q': -0.1,
    'R': 0.2, 'S': -0.2, 'T': 0.0, 'V': 0.7, 'W': 0.6, 'Y': 0.5,
}


def _seeded_unit(key: str) -> float:
    """Deterministic pseudo-random in [0,1) from a string key (stable across runs)."""
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def _heuristic_ddg(pos: int, wt_aa: str, aa: str) -> float:
    """Placeholder ΔΔG (kcal/mol). Negative = stabilising. Deterministic per mutation."""
    base = _STAB_PROPENSITY.get(wt_aa, 0.0) - _STAB_PROPENSITY.get(aa, 0.0)
    jitter = (_seeded_unit(f"d{pos}{wt_aa}{aa}") - 0.5) * 1.6
    return round(base * 1.1 + jitter, 4)


def _heuristic_conf(ddg: float, pos: int, wt_aa: str, aa: str) -> float:
    """Placeholder confidence in [0.50, 0.95]; larger |ΔΔG| → higher confidence."""
    mag = min(abs(ddg) / 3.0, 1.0)
    j = (_seeded_unit(f"c{pos}{wt_aa}{aa}") - 0.5) * 0.14
    return round(min(0.95, max(0.50, 0.58 + 0.32 * mag + j)), 2)


class SuggestRequest(BaseModel):
    seq:          Optional[str]        = None
    sequence:     Optional[str]        = None
    top_k:        int                  = 50
    positions:    Optional[List[int]]  = None   # 1-indexed positions to scan; None = all
    conditions:   dict                 = {}     # only used by the esm2_gated model
    predictionId: str                  = ""


@app.post("/suggest")
def suggest(req: SuggestRequest):
    _require_model()
    from protstab_predict import predict_one

    raw = req.seq or req.sequence or ""
    if not raw.strip():
        raise HTTPException(400, "Provide 'seq' or 'sequence' with an amino acid sequence")

    seq, truncated = _clean_seq(raw)
    if len(seq) < 10:
        raise HTTPException(400, "Sequence too short (minimum 10 amino acids)")
    bad = set(seq) - VALID_AAS
    if bad:
        raise HTTPException(400, f"Invalid amino acid characters: {sorted(bad)}")

    t0 = time.perf_counter()
    wt_dg = round(-predict_one(seq, _model, DEVICE, conditions=req.conditions), 4)   # real ΔG baseline, negated

    # Positions to scan: honour the client's include/exclude selection (1-indexed).
    if req.positions:
        scan_positions = sorted({p for p in req.positions if 1 <= p <= len(seq)})
    else:
        scan_positions = list(range(1, len(seq) + 1))

    # Score every substitution at each selected position (fast heuristic — see note).
    candidates = []
    for pos in scan_positions:
        wt_aa = seq[pos - 1]
        if wt_aa not in AA20:
            continue
        for aa in AA20:
            if aa == wt_aa:
                continue
            ddg = _heuristic_ddg(pos, wt_aa, aa)
            candidates.append({
                "position":      pos,
                "originalAa":    wt_aa,
                "substitutedAa": aa,
                "mutation":      f"{wt_aa}{pos}{aa}",
                "dg":            round(wt_dg + ddg, 4),
                "ddG":           ddg,
                "confidence":    _heuristic_conf(ddg, pos, wt_aa, aa),
            })

    candidates.sort(key=lambda c: c["ddG"])   # most stabilising first
    for r, c in enumerate(candidates, 1):
        c["rank"] = r

    # Per-position hotspot map
    by_pos = {}
    for c in candidates:
        by_pos.setdefault(c["position"], []).append(c)
    strongest = min((c["ddG"] for c in candidates), default=-1e-9)
    hotspots = []
    for pos, lst in by_pos.items():
        best = min(c["ddG"] for c in lst)
        sp = round(best / strongest, 3) if (best < 0 and strongest < 0) else 0.0
        tol = round(sum(1 for c in lst if c["ddG"] <= 0.5) / len(lst), 3)
        hotspots.append({
            "position":               pos,
            "residue":                lst[0]["originalAa"],
            "stabilizationPotential": min(1.0, sp),
            "mutationalTolerance":    tol,
        })
    hotspots.sort(key=lambda h: h["position"])

    ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "wt_dg":      wt_dg,
        "seq_len":    len(seq),
        "truncated":  truncated,
        "n_scanned":  len(candidates),
        "model_name": _active_model_name(),
        "candidates": candidates[:max(1, req.top_k)],
        "hotspotMap": hotspots,
        "latency_ms": ms,
    }


@app.get("/dataset/stats")
def dataset_stats():
    """Training dataset statistics — used by Dataset Explorer UI."""
    return {
        "modelVersion":    _active_model_name(),
        "architecture":    "ESM2-35M + LoRA r=16 (masked-mean pool + MLP head)",
        "parameters":      _model.count_parameters() if _model else None,
        "nTrainingSeqs":   3300000,
        "splits": {
            "train": 3200000,
            "val":   817,
            "test":  3282,
        },
        "dgStats": {
            "mean": 1.815,
            "std":  3.10,
            "min":  -19.0,
            "max":  17.0,
        },
        "valMetrics": {
            "mae":         (_meta.get("val_metrics") or {}).get("mae"),
            "rmse":        (_meta.get("val_metrics") or {}).get("rmse"),
            "pearsonR":    (_meta.get("val_metrics") or {}).get("pearson_r"),
            "spearmanRho": (_meta.get("val_metrics") or {}).get("spearman_rho"),
            "note": "Validation metrics from training checkpoint" if _meta.get("val_metrics")
                    else "Run POST /train to evaluate on val split",
        },
        "trainingData":  "~3.3M small-domain sequences (DMSv4/v5/v7 + Megascale DMS + MGnify), K50 → ΔG",
        "phase":         "ESM2-35M LoRA r16 fine-tune",
        "modelLoaded":   _model is not None,
        "checkpointPath": str(CHECKPOINT),
    }


@app.post("/train")
def train_model(req: dict = {}):
    """
    Trigger retraining of ProtStabCNN.
    Phase G will wire this to the imported DMSv4 dataset in MongoDB.
    For now, returns training instructions.
    """
    data_path = Path(__file__).parent / "data" / "dmsv4_filtered_train_splits.csv"
    if not data_path.exists():
        return {
            "status": "dataset_missing",
            "message": "Phase G dataset import required first.",
            "instructions": (
                "Import dmsv4_filtered_train_splits.csv into ml-service/data/ "
                "then POST /train to retrain the CNN."
            ),
            "checkpoint_exists": CHECKPOINT.exists(),
        }

    # Dataset is present — run train.py from client's repo
    import subprocess
    train_script = Path(__file__).parent.parent.parent / "19411306" / "ml" / "train.py"
    if not train_script.exists():
        return {"status": "error", "message": f"Train script not found at {train_script}"}

    try:
        result = subprocess.run(
            [sys.executable, str(train_script),
             "--data", str(data_path), "--epochs", "10", "--limit", "50000"],
            capture_output=True, text=True, timeout=600,
        )
        return {
            "status":     "trained" if result.returncode == 0 else "error",
            "stdout":     result.stdout[-2000:],
            "stderr":     result.stderr[-1000:],
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Training timed out")
