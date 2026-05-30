# hsFAST Platform — What We Need to Build the Full System

## 1. DATA NEEDED FROM CLIENT (Most Critical)

### 1.1 Training Dataset (Without this, ML predictions are fake)
Ask the client to share:

| File | Description | Format |
|------|-------------|--------|
| Stability assay results | All hsFAST/GlowTag experiment results | .xlsx or .csv |
| Variant sequences | FASTA sequences for all tested variants | .fasta or column in spreadsheet |
| Mutation list | Structured mutations per variant (e.g., A123V, L456P) | Column in spreadsheet |
| Conditions | Temperature, pH, solvent, ionic strength per experiment | Column in spreadsheet |
| Readouts | Apparent Tm, half-life, fluorescence values, replicates | Column in spreadsheet |
| Parent sequences | Wild-type / reference enzyme FASTA sequences | .fasta files |

**Minimum needed to train the first real model: 500+ variants with stability measurements**

### 1.2 Standard Data Input Template
Ask client for:
- Their current Excel template they use to record plate reader data
- Example raw plate reader export file (.xlsx)
- Example raw FACS export file (.csv)
- The plate layout they use (which wells are controls, which are variants)

### 1.3 Control Standards
- What negative controls they use (e.g., wells labeled "NC")
- What positive controls they use (e.g., "hsFAST only", known stable partner)
- Expected fluorescence ranges for passing QC

### 1.4 Structural Data (Optional but improves ML)
- Any PDB IDs or AlphaFold IDs for their key enzymes
- Active site residue positions for their target enzymes
- Domain boundary annotations

---

## 2. API KEYS NEEDED

### 2.1 Anthropic Claude API (PAID — Gold Tier AI Chat)
- **Purpose:** Powers the AI chat assistant for Gold tier users
- **Cost:** ~$3-15 per million tokens (very cheap for this use case)
- **Get it:** https://console.anthropic.com
- **Model to use:** claude-sonnet-4-6 (fast + smart)
- **Add to .env:** `ANTHROPIC_API_KEY=sk-ant-...`

### 2.2 Everything Else is FREE / Open Source

| Tool | Purpose | Cost | Notes |
|------|---------|------|-------|
| ESM-2 (Meta) | Protein sequence embeddings for ML | Free | Open source on Hugging Face |
| ESMFold (Meta) | Predict 3D protein structure | Free | API or self-hosted |
| AlphaFold | Alternative structure prediction | Free | Google DeepMind |
| HMMER / Pfam | Enzyme family annotation | Free | Open source |
| UniProt API | Protein database lookups | Free | REST API |
| PDB API | Known structure lookups | Free | REST API |

---

## 3. TECH STACK FOR PYTHON ML SERVICE

### Install Required (Python 3.10+)
```
pip install fastapi uvicorn
pip install torch                    # PyTorch (ESM-2 runs on this)
pip install fair-esm                 # Meta's ESM protein models
pip install transformers             # Hugging Face (ESMFold)
pip install scikit-learn             # ML models (Random Forest, XGBoost)
pip install xgboost                  # Gradient boosting
pip install pandas numpy scipy       # Data processing + curve fitting
pip install biopython                # FASTA parsing
pip install openpyxl                 # Excel file reading
pip install requests                 # API calls
```

### Python Version
- Python 3.10 or 3.11 recommended
- Get it: https://www.python.org/downloads/

---

## 4. FULL ADVANCED BUILD ROADMAP

### Phase 2 — Data Layer UI (Next — 2 sessions)
**What:** The hsFAST data ingestion system
- Upload .xlsx/.csv from plate reader or FACS
- Validate against template, show errors
- Plate heatmap view (each well color-coded by fluorescence)
- Experiment detail — raw traces + fitted curves
- Variant detail page — all historical measurements
- Campaign trend dashboard — best Tm over time
- Comparison view — overlay multiple variants

### Phase 3 — Python FastAPI ML Service (2 sessions)
**What:** Real science replacing Math.random()
- FastAPI app in `/ml-service` folder
- Parse and validate training data from MongoDB
- Generate ESM-2 embeddings for each sequence
- Train stability predictor (one per condition type: thermal, pH, solvent)
- Train activity-risk predictor
- Return real ranked mutations with confidence intervals
- Called by Express backend via HTTP

### Phase 4 — Real Structure Features (1 session)
**What:** Structural context for predictions
- Call ESMFold API to get predicted structure for any enzyme
- Extract: secondary structure, solvent accessibility, active site distance
- Feed structural features into ML model
- Cache structures in MongoDB (expensive to recompute)

### Phase 5 — AI Chat Assistant — Gold Tier (1 session)
**What:** Claude-powered chat scoped to a prediction
- Anthropic Claude API with RAG over training data
- User asks: "Why did you suggest A92V?"
- System retrieves relevant training records from MongoDB
- Claude answers with citations to real data, never fabricates
- Every answer traceable to actual experiments

### Phase 6 — Analytics Engine (1 session)
**What:** Real curve fitting for the Data Layer
- Fit fluorescence vs time to exponential decay → half-life
- Fit fluorescence vs temperature to sigmoid → apparent Tm
- Statistical QC: Grubbs outlier test, t-tests between variants
- Replicate aggregation with error bars

### Phase 7 — Reports & Export (1 session)
**What:** Professional output
- PDF report generation (prediction run summary)
- PNG/SVG plot export
- Full CSV with all metadata columns
- Shareable links to specific views

### Phase 8 — Production (1 session)
**What:** Ship it
- Environment variables for production
- Deploy backend (Railway / Render / DigitalOcean)
- Deploy frontend (Vercel / Netlify)
- Deploy Python ML service (separate container)
- MongoDB Atlas for production database

---

## 5. QUESTIONS TO ASK THE CLIENT

1. How many variants have been tested so far in total?
2. What is the primary target enzyme for the first ML model?
3. Can you share 1-2 example plate reader output files?
4. What temperature ranges are most common in your experiments?
5. Do you have any structural data (PDB IDs) for your key enzymes?
6. What defines "Gold tier" — is it a set number of variants contributed?
7. Will external customers share sequence data, or only fluorescence data?
8. Is there a preference for hosting: cloud (AWS/Azure) or on-premises?
9. What is the expected number of users at launch?
10. Do you have an existing Auth0 / Okta account, or should we build auth from scratch?

---

## 6. PRIORITY ORDER

1. **Get training data** — nothing else matters without real data
2. **Get Anthropic API key** — needed for Gold tier chat
3. **Install Python 3.10+** — needed for ML service
4. **Share example plate reader file** — needed for Data Layer
