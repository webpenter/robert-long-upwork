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

It creates the Space if needed and uploads the folder. The checkpoint goes via
LFS automatically; it is ~640MB for the current ESM2-150M gated model, so the
first upload takes a while. Afterwards, set ML_SERVICE_URL on Render to the
Space URL.

Note the model is taken from this folder on disk, NOT from git — so the Space
gets whatever best_model.pt is here locally, which may differ from the copy
committed to the repository.
"""
import os
import sys
from huggingface_hub import HfApi


def main():
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not positional:
        sys.exit(
            "Usage: python deploy_hf.py <hf-username>/<space-name> [--private]\n"
            "Authenticate first with `huggingface-cli login`, or set HF_TOKEN."
        )
    repo_id = positional[0]
    private = "--private" in flags

    # HF_TOKEN wins when set; otherwise fall back to whatever `huggingface-cli
    # login` cached. Passing token=None makes HfApi resolve the stored
    # credential, which keeps the token out of shell history and transcripts.
    api = HfApi(token=os.environ.get("HF_TOKEN"))
    try:
        who = api.whoami()
    except Exception:
        sys.exit(
            "No Hugging Face credentials found. Either run `huggingface-cli login` "
            "once, or set HF_TOKEN to a WRITE token "
            "(https://huggingface.co/settings/tokens)."
        )
    print(f"[deploy] authenticated as {who.get('name')}")

    here = os.path.dirname(os.path.abspath(__file__))

    # exist_ok=True means an existing Space keeps whatever visibility it already
    # has — `private` only takes effect when the Space is created here. Changing
    # an existing Space is done in its Settings page, not from this script.
    print(f"[deploy] creating/locating Space '{repo_id}' (Docker SDK, private={private})…")
    api.create_repo(
        repo_id=repo_id, repo_type="space", space_sdk="docker",
        private=private, exist_ok=True,
    )

    print("[deploy] uploading ml-service (model uploads via LFS, ~130MB — be patient)…")
    api.upload_folder(
        folder_path=here,
        repo_id=repo_id,
        repo_type="space",
        ignore_patterns=[
            "__pycache__/*", "*.pyc", ".git/*", "*.rar", "eval_dmsv4.py", "deploy_hf.py",
            # Only best_model.pt is served. Everything else in models/ is a local
            # backup or a candidate checkpoint, and each is roughly 640MB — shipping
            # them would add gigabytes to the Space for no benefit.
            "models/*backup*.pt", "models/new-updated-*.pt", "models/best_model_esm2*.pt",
            "models/best_model_r*.pt",
        ],
        commit_message="Deploy hsFAST ML service",
    )

    print(f"\n[deploy] done -> https://huggingface.co/spaces/{repo_id}")
    print("[deploy] the Space will build (Docker) for a few minutes; watch the logs there.")
    print("[deploy] then copy the Space's public URL and set it on Render as:")
    print("           ML_SERVICE_URL = https://<that-space-url>")


if __name__ == "__main__":
    main()
