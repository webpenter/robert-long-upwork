"""
Inference helpers — dispatches between two model families based on the checkpoint:
  - ProtStabCNN          (model_type absent / 'cnn')        — one-hot 1D CNN
  - ESM2LoRARegressor    (model_type == 'esm2_lora')        — ESM2-35M + LoRA

Works on CPU or GPU — auto-detects available device.
"""

import torch
from pathlib import Path
from protstab_model import ProtStabCNN, encode_sequence, MAX_LEN


def _is_esm2(model) -> bool:
    return model.__class__.__name__ == "ESM2LoRARegressor"


def load_model(checkpoint_path: str, device: str = "cpu"):
    path = Path(checkpoint_path)
    if not path.exists():
        raise FileNotFoundError(f"No checkpoint at {path}. Train first.")

    # Peek at metadata to decide which architecture to build (full load, not weights_only,
    # because esm2_lora checkpoints carry model_type/model_name metadata).
    ckpt = torch.load(path, map_location=device, weights_only=False)

    if isinstance(ckpt, dict) and ckpt.get("model_type") == "esm2_lora":
        from esm2_lora_model import load_model as load_esm2
        return load_esm2(checkpoint_path, device)

    # Default: one-hot CNN
    model = ProtStabCNN()
    state = ckpt.get("state_dict", ckpt) if isinstance(ckpt, dict) else ckpt
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def predict_one(seq: str, model, device: str = "cpu") -> float:
    """Return predicted ΔG (kcal/mol) for a single amino acid sequence."""
    if _is_esm2(model):
        from esm2_lora_model import predict_one as p1
        return p1(seq, model, device)
    x = encode_sequence(seq).unsqueeze(0).to(device)
    with torch.no_grad():
        return round(model(x).item(), 4)


def predict_batch(seqs: list[str], model, device: str = "cpu") -> list[float]:
    """Return predicted ΔG values for a list of sequences (batched)."""
    if _is_esm2(model):
        from esm2_lora_model import predict_batch as pb
        return pb(seqs, model, device)
    tensors = torch.stack([encode_sequence(s) for s in seqs]).to(device)
    with torch.no_grad():
        return [round(v, 4) for v in model(tensors).tolist()]


def stability_label(dg: float) -> str:
    # Client convention: NEGATIVE ΔG = more stable (dg here is already negated at the API boundary).
    if dg < -3.0: return "highly stable"
    if dg < -0.5: return "stable"
    if dg <  0.5: return "marginally stable"
    if dg <  3.0: return "unstable"
    return "highly unstable"
