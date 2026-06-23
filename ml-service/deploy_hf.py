#!/usr/bin/env python
"""
Deploy this ml-service folder to a Hugging Face Space (Docker SDK).

One-time:
  1. Create a free account at https://huggingface.co
  2. Make a WRITE token at https://huggingface.co/settings/tokens

Run (from the repo root or anywhere):
  # bash / git-bash:
  HF_TOKEN=hf_xxx python ml-service/deploy_hf.py <hf-username>/hsfast-ml
  # PowerShell:
  $env:HF_TOKEN="hf_xxx"; python ml-service/deploy_hf.py <hf-username>/hsfast-ml

It creates the Space if needed and uploads the folder (the 130MB model goes via
LFS automatically). Afterwards, set ML_SERVICE_URL on Render to the Space URL.
"""
import os
import sys
from huggingface_hub import HfApi


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: HF_TOKEN=<write-token> python deploy_hf.py <hf-username>/<space-name>")
    repo_id = sys.argv[1]
    token = os.environ.get("HF_TOKEN")
    if not token:
        sys.exit("Set HF_TOKEN to a Hugging Face WRITE token (https://huggingface.co/settings/tokens)")

    here = os.path.dirname(os.path.abspath(__file__))
    api = HfApi(token=token)

    print(f"[deploy] creating/locating Space '{repo_id}' (Docker SDK)…")
    api.create_repo(repo_id=repo_id, repo_type="space", space_sdk="docker", exist_ok=True)

    print("[deploy] uploading ml-service (model uploads via LFS, ~130MB — be patient)…")
    api.upload_folder(
        folder_path=here,
        repo_id=repo_id,
        repo_type="space",
        ignore_patterns=["__pycache__/*", "*.pyc", ".git/*", "*.rar", "eval_dmsv4.py", "deploy_hf.py"],
        commit_message="Deploy hsFAST ML service",
    )

    print(f"\n[deploy] done -> https://huggingface.co/spaces/{repo_id}")
    print("[deploy] the Space will build (Docker) for a few minutes; watch the logs there.")
    print("[deploy] then copy the Space's public URL and set it on Render as:")
    print("           ML_SERVICE_URL = https://<that-space-url>")


if __name__ == "__main__":
    main()
