"""
Honest evaluation of the DEPLOYED model on the dmsv4 TEST split.
Predictions are compared in the dataset's native convention (positive = more stable),
i.e. the raw model output BEFORE the API-layer sign flip — so metrics are directly
comparable to the dmsv4 `deltaG` column the client validates against.

Usage:  python eval_dmsv4.py [N]      (N = number of test rows, default 2000)
"""
import sys
import numpy as np
import pandas as pd
from scipy.stats import pearsonr, spearmanr

from protstab_predict import load_model, predict_batch

DATA = r"D:/19411306/dmsv4_filtered_train_splits.csv"
CKPT = "models/best_model.pt"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000

print(f"[eval] loading deployed model: {CKPT}")
model = load_model(CKPT, "cpu")

print(f"[eval] reading up to {N} test rows from dmsv4 …")
rows = []
for chunk in pd.read_csv(DATA, usecols=["aa_seq", "deltaG", "split"], chunksize=50000):
    t = chunk[chunk["split"] == "test"].dropna(subset=["aa_seq", "deltaG"])
    rows.append(t)
    if sum(len(x) for x in rows) >= N:
        break
df = pd.concat(rows).head(N)
seqs = df["aa_seq"].astype(str).tolist()
y = df["deltaG"].to_numpy(dtype=float)

print(f"[eval] predicting {len(seqs)} sequences (native convention) …")
preds = []
B = 64
for i in range(0, len(seqs), B):
    preds.extend(predict_batch(seqs[i:i + B], model, "cpu"))
    if (i // B) % 5 == 0:
        print(f"  {i + len(seqs[i:i+B])}/{len(seqs)}", flush=True)
preds = np.array(preds, dtype=float)

mae = float(np.mean(np.abs(preds - y)))
rmse = float(np.sqrt(np.mean((preds - y) ** 2)))
ss_res = float(np.sum((y - preds) ** 2))
ss_tot = float(np.sum((y - y.mean()) ** 2))
r2 = 1 - ss_res / ss_tot if ss_tot else float("nan")
pear = float(pearsonr(preds, y)[0])
spear = float(spearmanr(preds, y)[0])

print("\n===== DEPLOYED MODEL on dmsv4 TEST split (native convention) =====")
print(f"  n         : {len(y)}")
print(f"  MAE       : {mae:.3f} kcal/mol")
print(f"  RMSE      : {rmse:.3f} kcal/mol")
print(f"  R^2       : {r2:.3f}")
print(f"  Pearson r : {pear:.3f}")
print(f"  Spearman  : {spear:.3f}")
print(f"  pred range: [{preds.min():.2f}, {preds.max():.2f}]  label range: [{y.min():.2f}, {y.max():.2f}]")
print(f"  seq len   : mean {np.mean([len(s) for s in seqs]):.0f}, max {max(len(s) for s in seqs)} "
      f"(model caps at 80 aa)")
