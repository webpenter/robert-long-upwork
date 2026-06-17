"""
ProtStabCNN — neural stability predictor (Phase D, Step 10).

Architecture:
  Input  : 506-dim sequence-window feature vector (extract_window())
             500 = 25-residue one-hot window of WT sequence
               6 = [blosum62, ΔKD, ΔVol, ΔCharge, RSA, pos_frac]
  Hidden : three fully-connected layers (256 → 128 → 64) with ReLU
  Output : scalar ΔΔG prediction (kcal/mol, S1724 sign convention)

Implemented as sklearn MLPRegressor inside a StandardScaler Pipeline.
No torch dependency required; integrates directly with the existing
train.py cross-validation framework.
"""

from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def create_protostab_cnn(max_iter: int = 300) -> Pipeline:
    """Return a fresh untrained ProtStabCNN pipeline."""
    return Pipeline([
        ('scaler', StandardScaler()),
        ('model', MLPRegressor(
            hidden_layer_sizes=(256, 128, 64),
            activation='relu',
            solver='adam',
            alpha=1e-4,
            batch_size=64,
            learning_rate='adaptive',
            learning_rate_init=1e-3,
            max_iter=max_iter,
            random_state=42,
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=20,
            tol=1e-4,
            verbose=False,
        )),
    ])
