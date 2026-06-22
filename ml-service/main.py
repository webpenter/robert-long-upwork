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

import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────

MODELS_DIR     = Path(__file__).parent / "models"
CHECKPOINT     = MODELS_DIR / "best_model.pt"
DEVICE         = "cuda" if torch.cuda.is_available() else "cpu"
VALID_AAS      = set("ACDEFGHIKLMNPQRSTVWYX")

_model = None    # loaded at startup
_meta  = {}      # checkpoint metadata (model_type, model_name, val_metrics)


def _read_meta() -> dict:
    """Read lightweight metadata from the checkpoint without keeping it in memory."""
    try:
        ckpt = torch.load(str(CHECKPOINT), map_location="cpu", weights_only=False)
        if isinstance(ckpt, dict):
            return {k: ckpt[k] for k in ("model_type", "model_name", "epoch", "val_metrics") if k in ckpt}
    except Exception:
        pass
    return {}


def _active_model_name() -> str:
    """Real name of the loaded model — stored by the backend as modelVersion."""
    if _meta.get("model_type") == "esm2_lora":
        return _meta.get("model_name", "esm2_t12_35M_lora")
    return "protstab_cnn_v0"


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model, _meta
    try:
        from protstab_predict import load_model
        _meta  = _read_meta()
        _model = load_model(str(CHECKPOINT), DEVICE)
        kind = _meta.get("model_type", "cnn")
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
    """Residue cap of the loaded model. ESM2-LoRA was trained at 80 aa; CNN uses 256."""
    if _meta.get("model_type") == "esm2_lora":
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
    is_esm2 = _meta.get("model_type") == "esm2_lora"
    if is_esm2:
        return {
            "name":          _meta.get("model_name", "esm2_t12_35M_lora"),
            "model_type":    "esm2_lora",
            "architecture":  "ESM2-35M (facebook/esm2_t12_35M_UR50D) + LoRA r=8 on q/k/v, "
                             "masked-mean pool → LayerNorm → MLP(480→256→64→1)",
            "parameters":    _model.count_parameters(),       # trainable (LoRA + head)
            "input":         "tokenized protein sequence, max 256 aa",
            "output":        "ΔG (kcal/mol) — positive = stable, negative = unstable",
            "training_data": "DMSv4 filtered (455,589 sequences)",
            "val_metrics":   _meta.get("val_metrics"),
            "epoch":         _meta.get("epoch"),
            "phase":         "Phase 2 — ESM2-35M LoRA fine-tune",
        }
    return {
        "name":          "protstab_cnn_v0",
        "model_type":    "cnn",
        "architecture":  "1D CNN — 3 ConvBlocks (21→64→128→256, k=5/5/3) + GlobalAvgPool + MLP(256→128→32→1)",
        "parameters":    _model.count_parameters(),
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
    # therefore equals -(dmsv4 deltaG).
    dg  = round(-predict_one(seq, _model, DEVICE), 4)
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


@app.get("/dataset/stats")
def dataset_stats():
    """Training dataset statistics — used by Dataset Explorer UI."""
    return {
        "modelVersion":    _active_model_name(),
        "architecture":    "1D CNN (3 ConvBlocks + MLP head)",
        "parameters":      _model.count_parameters() if _model else None,
        "nTrainingSeqs":   455589,
        "splits": {
            "train": 364471,
            "val":   45559,
            "test":  45559,
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
        "trainingData":  "DMSv4 filtered (Boltzmann K50 → ΔG conversion)",
        "phase":         "Phase 1 prototype — ESM2-35M fine-tune planned for Phase 2",
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
