# Model checkpoints

`best_model.pt` is the checkpoint the service loads at startup. Override it for local
testing with `ML_CHECKPOINT_PATH=/path/to/other.pt`.

The architecture is detected from the checkpoint itself (see `protstab_predict._detect_family`),
so dropping in a different `.pt` is enough — no code change required.

| Checkpoint | Architecture | Trainable params | Validation |
|---|---|---|---|
| `best_model.pt` (active, `expert1_region_aware` ep2, re-delivered 2026-09-16) | ESM2-150M + LoRA r32 + temperature/pH gating | 11,147,649 | MAE 0.666 · RMSE 1.007 · Pearson 0.865 · Spearman 0.868 (n=40,146) |
| `best_model_expert1_ep2_backup_20260916.pt` | same, previous delivery | 11,147,649 | MAE 0.687 · RMSE 1.029 · Pearson 0.858 · Spearman 0.861 |
| `best_model_r16_backup.pt` | ESM2-35M + LoRA r16 | 693,569 | MAE 1.090 · RMSE 1.665 · Pearson 0.750 · Spearman 0.806 |

## Recording training provenance

`GET /dataset/stats` reports the training corpus for whichever checkpoint is loaded.
Those facts cannot be recovered from the weights, so the service looks for them in two
places, in order:

1. **A `training_meta` key inside the checkpoint** — preferred, because it travels with
   the weights and can never drift from them:

   ```python
   ckpt = torch.load("best_model.pt", map_location="cpu")
   ckpt["training_meta"] = {
       "n_training_seqs": 3300000,
       "splits":   {"train": 3200000, "val": 817, "test": 3282},
       "dg_stats": {"mean": 1.815, "std": 3.10, "min": -19.0, "max": 17.0},
       "training_data": "short human-readable description of the corpus",
   }
   torch.save(ckpt, "best_model.pt")
   ```

2. **A sidecar `<checkpoint>.meta.json`** — same shape, useful when you would rather not
   rewrite a 638 MB file. See `best_model.pt.meta.json`.

If neither exists, `/dataset/stats` returns `null` for the corpus fields and
`trainingMetaSource: "not recorded"`. That is deliberate: reporting an unknown corpus is
correct, whereas serving another model's numbers is not.

## Local-only files

Everything in this directory except `best_model.pt` and the small `.joblib`/`.json` files
is git-ignored and excluded from `deploy_hf.py`. Keep backups here freely; they are not
uploaded to the Hugging Face Space.
