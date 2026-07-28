"""
ESM2-150M + LoRA + environmental-gating regressor for protein ΔG prediction.

Architecture supplied by the model author, verified layer-by-layer (strict
`load_state_dict`, zero missing/unexpected keys) against the trained checkpoint:
  - backbone : facebook/esm2_t30_150M_UR50D (EsmModel, 30 layers, hidden 640)
  - adapters : LoRA r=32, alpha=64, dropout=0.1 on every submodule literally
               named query/key/value/dense (attention q/k/v, attention output
               projection, and both FFN dense layers)
  - env_gate : Linear(2,64) -> SiLU -> Linear(64,64) -> Sigmoid — takes
               [temperature, pH] and produces a per-feature multiplicative gate
  - projector: Linear(640,64) — the checkpoint has ONLY this single Linear
               (no LayerNorm/second Linear — the author's reference script had
               a fuller Sequential here, but those extra layers have no
               matching weights in this specific checkpoint, so they're
               omitted to match what was actually trained)
  - fusion   : protein_feats * (1 + gate)   — residual gating, never fully
               zeroes the sequence signal
  - head     : Linear(64,32) -> SiLU -> Dropout(0.2) -> Linear(32,1)
  - pooling  : attention-masked mean pool over token embeddings (not the
               ESM pooler — the pooler's LoRA weights exist in the checkpoint
               because target_modules=["...", "dense"] matches pooler.dense
               too, but forward() here never calls it)

UNCONFIRMED — do not treat predictions from this model as trustworthy until
verified with the model author:
  - ENV_FEATURE normalization: temperature/pH are currently passed through
    RAW (see `_env_tensor`). If the author normalized them during training
    (min-max, z-score, etc.), predictions will be systematically wrong until
    this is corrected to match.
  - TOK_MAX_LEN: not recoverable from the checkpoint. Placeholder below;
    confirm the exact tokenizer max_length/truncation used in training.
  - This checkpoint has no `model_type`/`model_name` tag, so it is detected
    at load time via the presence of "env_gate." keys — see protstab_predict.py.
"""

import os
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import torch
import torch.nn as nn
from transformers import EsmConfig, EsmModel, AutoTokenizer

BACKBONE = "facebook/esm2_t30_150M_UR50D"
_TOKENIZER_FALLBACK = "facebook/esm2_t12_35M_UR50D"  # shared UR50D vocab

# TODO(confirm with model author): exact training truncation length.
MAX_LEN = 512
TOK_MAX_LEN = MAX_LEN + 2  # + BOS/EOS

LORA_R = 32
LORA_ALPHA = 64

# TODO(confirm with model author): were these raw values, or normalized
# (min-max / z-score) before training? Using raw °C / pH units for now.
DEFAULT_TEMPERATURE_C = 37.0
DEFAULT_PH = 7.0


def _build_config() -> EsmConfig:
    # facebook/esm2_t30_150M_UR50D — no network download required.
    return EsmConfig(
        vocab_size=33,
        hidden_size=640,
        num_hidden_layers=30,
        num_attention_heads=20,
        intermediate_size=2560,
        max_position_embeddings=1026,
        position_embedding_type="rotary",
        token_dropout=True,
        emb_layer_norm_before=False,
        pad_token_id=1,
        mask_token_id=32,
    )


class ESM2GatedStabilityModel(nn.Module):
    def __init__(self):
        super().__init__()
        from peft import LoraConfig, get_peft_model

        base = EsmModel(_build_config(), add_pooling_layer=True)
        lora_cfg = LoraConfig(
            r=LORA_R,
            lora_alpha=LORA_ALPHA,
            target_modules=["query", "key", "value", "dense"],
            lora_dropout=0.1,
            bias="none",
        )
        self.esm2 = get_peft_model(base, lora_cfg)

        self.env_gate = nn.Sequential(
            nn.Linear(2, 64),
            nn.SiLU(),
            nn.Linear(64, 64),
            nn.Sigmoid(),
        )
        # Matches the checkpoint exactly: single Linear, no LayerNorm/extra
        # Linear (see module docstring).
        self.protein_projector = nn.Sequential(
            nn.Linear(640, 64),
        )
        self.regression_head = nn.Sequential(
            nn.Linear(64, 32),
            nn.SiLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 1),
        )

    def forward(self, input_ids, attention_mask, env_features):
        out = self.esm2(input_ids=input_ids, attention_mask=attention_mask)
        hidden = out.last_hidden_state                       # (B, T, 640)
        mask = attention_mask.unsqueeze(-1).float()
        pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)

        protein_feats = self.protein_projector(pooled)        # (B, 64)
        gate = self.env_gate(env_features)                    # (B, 64)
        modulated = protein_feats * (1.0 + gate)

        return self.regression_head(modulated).squeeze(-1)    # (B,)

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


_tokenizer = None


def _get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        try:
            _tokenizer = AutoTokenizer.from_pretrained(BACKBONE)
        except Exception:
            _tokenizer = AutoTokenizer.from_pretrained(_TOKENIZER_FALLBACK)
    return _tokenizer


def load_model(checkpoint_path: str, device: str = "cpu") -> ESM2GatedStabilityModel:
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    state = ckpt.get("state_dict", ckpt)
    model = ESM2GatedStabilityModel()
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing or unexpected:
        print(f"[esm2_gated] load: {len(missing)} missing, {len(unexpected)} unexpected")
        if missing[:5]:
            print("  e.g. missing:", missing[:5])
        if unexpected[:5]:
            print("  e.g. unexpected:", unexpected[:5])
    model.to(device)
    model.eval()
    return model


def _env_tensor(conditions_list, device) -> torch.Tensor:
    """conditions_list: list of (temperature_c, ph) tuples, one per sequence.
    RAW pass-through — see UNCONFIRMED note in the module docstring."""
    return torch.tensor(conditions_list, dtype=torch.float32, device=device)


@torch.no_grad()
def predict_batch(seqs, model, device="cpu", conditions=None):
    """
    conditions: optional list of {"temperature": float, "ph": float} dicts,
    same length as seqs. Missing entries fall back to DEFAULT_TEMPERATURE_C /
    DEFAULT_PH (physiological defaults — NOT confirmed to match the training
    distribution; see module docstring).
    """
    tok = _get_tokenizer()
    enc = tok([s.upper().strip() for s in seqs],
              return_tensors="pt", padding="max_length", truncation=True, max_length=TOK_MAX_LEN)
    enc = {k: v.to(device) for k, v in enc.items()}

    conditions = conditions or [{}] * len(seqs)
    env_list = [
        (c.get("temperature", DEFAULT_TEMPERATURE_C) or DEFAULT_TEMPERATURE_C,
         c.get("ph", DEFAULT_PH) or DEFAULT_PH)
        for c in conditions
    ]
    env = _env_tensor(env_list, device)

    out = model(enc["input_ids"], enc["attention_mask"], env)
    vals = out.tolist()
    if isinstance(vals, float):
        vals = [vals]
    return [round(v, 4) for v in vals]


def predict_one(seq, model, device="cpu", conditions=None):
    return predict_batch([seq], model, device, conditions=[conditions or {}])[0]


def stability_label(dg: float) -> str:
    if dg > 3.0:  return "highly stable"
    if dg > 0.5:  return "stable"
    if dg > -0.5: return "marginally stable"
    if dg > -3.0: return "unstable"
    return "highly unstable"
