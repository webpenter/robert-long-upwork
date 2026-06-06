"""
hsFAST ML Service — FastAPI
Endpoints:
  POST /predict       - run prediction for a FASTA sequence
  POST /train         - retrain model from CSV files
  GET  /health        - liveness check
  GET  /model/info    - current model metadata
"""

import json, os, subprocess, sys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title='hsFAST ML Service', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://localhost:4000'],
    allow_methods=['*'],
    allow_headers=['*'],
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
META_PATH  = os.path.join(MODELS_DIR, 'training_meta.json')


# ── Schemas ──────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    sequence:     str
    conditions:   dict = {}
    tier:         str  = 'GOLD'
    predictionId: str  = ''


class TrainRequest(BaseModel):
    fromCsv: bool = True


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    model_ready = os.path.exists(os.path.join(MODELS_DIR, 'stability_model.joblib'))
    return {
        'status':      'ok',
        'modelReady':  model_ready,
        'service':     'hsFAST ML Service v1.0',
    }


@app.get('/model/info')
def model_info():
    if not os.path.exists(META_PATH):
        raise HTTPException(status_code=404, detail='Model not trained yet. POST /train first.')
    with open(META_PATH) as f:
        meta = json.load(f)
    # Return summary (not all variant predictions)
    return {
        'modelVersion':   meta.get('modelVersion'),
        'algorithm':      meta.get('algorithm'),
        'nVariants':      meta.get('nVariants'),
        'nProteins':      meta.get('nProteins'),
        'nFeatures':      meta.get('nFeatures'),
        'randomCvR2':     meta.get('looR2'),
        'randomCvRMSE':   meta.get('looRMSE'),
        'proteinCvR2':    meta.get('proteinCvR2'),
        'proteinCvRMSE':  meta.get('proteinCvRMSE'),
        'proteinCvPCC':   meta.get('proteinCvPCC'),
        'inSampleR2':     meta.get('inSampleR2'),
        'pearsonR':       meta.get('pearsonR'),
        'stabilityRange': meta.get('stabilityRange'),
    }


@app.post('/predict')
def predict(req: PredictRequest):
    try:
        from predict import predict_for_sequence
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Predict module error: {e}')

    if not os.path.exists(os.path.join(MODELS_DIR, 'stability_model.joblib')):
        raise HTTPException(
            status_code=503,
            detail='Model not trained. POST /train to train from CSV files first.')

    try:
        result = predict_for_sequence(req.sequence, req.conditions, req.tier.upper())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/train')
def train_model(req: TrainRequest):
    """Trigger model retraining. Runs train.py as a subprocess."""
    args = [sys.executable, os.path.join(os.path.dirname(__file__), 'train.py')]
    if req.fromCsv:
        args.append('--from-csv')

    try:
        result = subprocess.run(
            args,
            cwd=os.path.dirname(__file__),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f'Training failed:\n{result.stderr}')

        if not os.path.exists(META_PATH):
            raise HTTPException(status_code=500, detail='Training ran but model file not found.')

        with open(META_PATH) as f:
            meta = json.load(f)

        return {
            'status':       'trained',
            'modelVersion': meta.get('modelVersion'),
            'nVariants':    meta.get('nVariants'),
            'looR2':        meta.get('looR2'),
            'algorithm':    meta.get('algorithm'),
            'output':       result.stdout[-2000:],
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail='Training timed out (>120s)')
