"""
ProtStab CNN — protein thermodynamic stability predictor.
Input : one-hot encoded protein sequence (VOCAB_SIZE × MAX_LEN)
Output: predicted ΔG (kcal/mol)  — positive = stable, negative = unstable
"""

import torch
import torch.nn as nn

AA_VOCAB   = list("ACDEFGHIKLMNPQRSTVWYX")   # X = unknown / non-standard
AA_TO_IDX  = {aa: i for i, aa in enumerate(AA_VOCAB)}
VOCAB_SIZE = len(AA_VOCAB)                    # 21
MAX_LEN    = 256                              # sequences truncated/padded to this length


def encode_sequence(seq: str) -> torch.Tensor:
    """Return one-hot tensor of shape (VOCAB_SIZE, MAX_LEN)."""
    seq     = seq.upper().strip()[:MAX_LEN]
    one_hot = torch.zeros(VOCAB_SIZE, MAX_LEN)
    for i, aa in enumerate(seq):
        idx = AA_TO_IDX.get(aa, AA_TO_IDX["X"])
        one_hot[idx, i] = 1.0
    return one_hot


class ConvBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, kernel: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(in_ch, out_ch, kernel_size=kernel, padding=kernel // 2),
            nn.BatchNorm1d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.net(x)


class ProtStabCNN(nn.Module):
    """
    3-layer 1D CNN with global average pooling → MLP head.
    ~500k parameters, pre-trained on DMSv4 (455k sequences).
    """

    def __init__(self, dropout: float = 0.3):
        super().__init__()
        self.encoder = nn.Sequential(
            ConvBlock(VOCAB_SIZE, 64,  kernel=5),
            ConvBlock(64,         128, kernel=5),
            ConvBlock(128,        256, kernel=3),
        )
        self.head = nn.Sequential(
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(128, 32),
            nn.ReLU(inplace=True),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.encoder(x)       # (B, 256, MAX_LEN)
        x = x.mean(dim=2)         # global average pool → (B, 256)
        return self.head(x).squeeze(-1)  # (B,)

    def count_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
