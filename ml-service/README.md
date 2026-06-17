---
title: hsFAST ML Service
emoji: 🧬
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# hsFAST ML Service

FastAPI service serving the ESM2-35M + LoRA protein stability (ΔG) model for the
Enzyme Stability ML Prediction Platform.

This is the **ML inference backend** only — it is called server-to-server by the
Node/Express API, not directly by the browser.

## Endpoints
- `GET  /health` — liveness + model status
- `GET  /model/info` — architecture + training metadata
- `POST /predict` — ΔG for a single sequence
- `POST /predict/batch` — ΔG for up to 100 sequences
- `GET  /dataset/stats` — training dataset statistics

## Notes
- The ESM2 weights are bundled in `models/best_model.pt` (Git LFS).
- The tokenizer is pre-cached at build time (see `Dockerfile`) so runtime
  offline mode works.
- First request after the Space wakes from sleep takes ~30–60 s (model load).
