"""
ESM2-35M + LoRA regression model for protein ΔG prediction.

Reconstructs the architecture stored in best_model.pt (model_type=esm2_lora):
  - backbone : facebook/esm2_t12_35M_UR50D (EsmModel, 12 layers, hidden 480)
  - adapters : LoRA r=8 on attention query/key/value
  - head     : LayerNorm(480) -> Linear(480,256) -> GELU -> Dropout -> Linear(256,64) -> GELU -> Linear(64,1)
  - pooling  : attention-masked mean pool over token embeddings

The full ESM weights are bundled in the checkpoint, so no HuggingFace download
is needed — only the model config (built manually) and tokenizer (shared UR50D vocab).
"""

import os
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import torch
import torch.nn as nn
from transformers import EsmConfig, EsmModel, AutoTokenizer

# The model was trained with tokenizer max_length=82 (= 80 residues + BOS + EOS).
# Sequences longer than 80 aa are truncated to the first 80 — must match training/Colab
# exactly or predictions diverge (the gap grows with sequence length).
MAX_LEN = 80          # residue cap (what the user sees)
TOK_MAX_LEN = 82      # tokenizer max_length, mirrors Colab Config cell
BACKBONE = "facebook/esm2_t12_35M_UR50D"
_TOKENIZER_FALLBACK = "facebook/esm2_t6_8M_UR50D"  # identical UR50D vocab, cached locally


def _build_config() -> EsmConfig:
    # Config for esm2_t12_35M_UR50D (no download required)
    return EsmConfig(
        vocab_size=33,
        hidden_size=480,
        num_hidden_layers=12,
        num_attention_heads=20,
        intermediate_size=1920,
        max_position_embeddings=1026,
        position_embedding_type="rotary",
        token_dropout=True,
        emb_layer_norm_before=False,
        pad_token_id=1,
        mask_token_id=32,
    )


class ESM2LoRARegressor(nn.Module):
    def __init__(self, lora_r: int = 8, dropout: float = 0.3):
        super().__init__()
        from peft import LoraConfig, get_peft_model

        base = EsmModel(_build_config(), add_pooling_layer=True)
        lora_cfg = LoraConfig(
            r=lora_r,
            lora_alpha=lora_r * 2,
            target_modules=["query", "key", "value"],
            lora_dropout=0.0,
            bias="none",
        )
        self.esm = get_peft_model(base, lora_cfg)
        self.head = nn.Sequential(
            nn.LayerNorm(480),       # 0
            nn.Linear(480, 256),     # 1
            nn.GELU(),               # 2
            nn.Dropout(dropout),     # 3
            nn.Linear(256, 64),      # 4
            nn.GELU(),               # 5
            nn.Linear(64, 1),        # 6
        )

    def forward(self, input_ids, attention_mask):
        out = self.esm(input_ids=input_ids, attention_mask=attention_mask)
        hidden = out.last_hidden_state                      # (B, T, 480)
        mask = attention_mask.unsqueeze(-1).float()         # (B, T, 1)
        pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
        return self.head(pooled).squeeze(-1)                # (B,)

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


def load_model(checkpoint_path: str, device: str = "cpu") -> ESM2LoRARegressor:
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    state = ckpt.get("state_dict", ckpt)
    model = ESM2LoRARegressor()
    missing, unexpected = model.load_state_dict(state, strict=False)
    # Report only non-trivial mismatches
    real_missing = [k for k in missing if "lora" not in k]
    if real_missing or unexpected:
        print(f"[esm2_lora] load: {len(missing)} missing, {len(unexpected)} unexpected")
        if real_missing[:5]:
            print("  e.g. missing:", real_missing[:5])
        if unexpected[:5]:
            print("  e.g. unexpected:", unexpected[:5])
    model.to(device)
    model.eval()
    return model


@torch.no_grad()
def predict_batch(seqs, model, device="cpu"):
    tok = _get_tokenizer()
    # Mirror Colab exactly: max_length=82, padding='max_length', truncation=True.
    # (Padding tokens are masked out of the mean pool, so padding mode does not affect output.)
    enc = tok([s.upper().strip() for s in seqs],
              return_tensors="pt", padding="max_length", truncation=True, max_length=TOK_MAX_LEN)
    enc = {k: v.to(device) for k, v in enc.items()}
    out = model(enc["input_ids"], enc["attention_mask"])
    vals = out.tolist()
    if isinstance(vals, float):
        vals = [vals]
    return [round(v, 4) for v in vals]


def predict_one(seq, model, device="cpu"):
    return predict_batch([seq], model, device)[0]


def stability_label(dg: float) -> str:
    if dg > 3.0:  return "highly stable"
    if dg > 0.5:  return "stable"
    if dg > -0.5: return "marginally stable"
    if dg > -3.0: return "unstable"
    return "highly unstable"
