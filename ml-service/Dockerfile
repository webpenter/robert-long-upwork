# hsFAST ML service — Hugging Face Space (Docker SDK)
# Serves the ESM2-35M + LoRA ΔG model (models/best_model.pt) via FastAPI.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.hfcache \
    TRANSFORMERS_CACHE=/app/.hfcache

WORKDIR /app

# git is needed by some transformers code paths; build-essential for any wheels.
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install the CPU-only torch wheel FIRST (the default wheel pulls ~2 GB of CUDA
# libs we don't need on a free CPU Space). The torch>=2.0.0 line in
# requirements.txt is then already satisfied and skipped.
RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install -r requirements.txt

# The model bundles the ESM2 weights, but the tokenizer is still fetched from
# the Hub. esm2_lora_model.py forces TRANSFORMERS_OFFLINE=1 at runtime, so we
# must pre-download & cache the tokenizer now (with offline mode OFF) or the
# first prediction will crash. Cache is made world-readable for the runtime
# user (HF Spaces run the container as UID 1000, not root).
RUN HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 \
    python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('facebook/esm2_t12_35M_UR50D')" && \
    chmod -R 777 /app/.hfcache

COPY . .

# HF Spaces (Docker) expects the app on port 7860 (see README app_port).
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
