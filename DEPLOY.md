# Free Deployment Guide — Enzyme Stability ML Platform

Stand up the full app on free tiers so a client can open a link and test it.
Good for a few days of demo use. **Total cost: $0.**

## Architecture

```
Browser ──▶ Frontend (Vercel, static)
                │  VITE_API_URL
                ▼
            Backend  (Render, Node/Express)
                ├──▶ MongoDB Atlas (M0 free)        MONGODB_URI
                └──▶ ML service (Hugging Face Space) ML_SERVICE_URL
                         FastAPI + PyTorch + ESM2-LoRA (best_model.pt)
```

Four free pieces. Do them in this order — each step needs the URL from the one before.

---

## 1. MongoDB Atlas (database)

1. Create a free account → **Build a Database** → **M0 (Free)**.
2. **Database Access** → add a user (username + password).
3. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`)
   — required because Render's outbound IP isn't fixed on the free tier.
4. **Connect → Drivers** → copy the connection string. It looks like:
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/enzyme-ml?retryWrites=true&w=majority`
   (add the `enzyme-ml` database name after `.net/` as shown).

Keep this string — it's `MONGODB_URI`.

---

## 2. ML service → Hugging Face Space (FastAPI + PyTorch)

The only free host with enough RAM (16 GB) for torch + ESM2. The repo already
contains everything needed: `ml-service/Dockerfile`, `ml-service/README.md`
(Space config), and `models/best_model.pt` (in Git LFS).

1. On huggingface.co → **New → Space**.
   - Owner: you · Name: e.g. `hsfast-ml` · License: your choice
   - **SDK: Docker** · **Blank** · Hardware: **CPU basic (free)** · Public
2. Push the `ml-service/` folder as the Space's repo root. From your project root:

   ```powershell
   # Materialize the LFS model file locally first
   git lfs pull

   # Clone the empty Space next to your project
   cd ..
   git clone https://huggingface.co/spaces/<your-username>/hsfast-ml
   cd hsfast-ml

   # Copy the ML service contents in (PowerShell)
   Copy-Item -Recurse -Force "..\Enzyme Stability ML Prediction Platform\ml-service\*" .

   # HF tracks *.pt via LFS automatically; commit and push
   git add -A
   git commit -m "Deploy hsFAST ML service"
   git push
   ```

   > You'll authenticate to HF with a write **access token** (huggingface.co →
   > Settings → Access Tokens) as the git password.

3. Watch the **Building** logs on the Space page. First build takes several
   minutes (installs torch + transformers, pre-caches the ESM2 tokenizer).
4. When it shows **Running**, your ML URL is:
   `https://<your-username>-hsfast-ml.hf.space`
   Verify: open `https://<your-username>-hsfast-ml.hf.space/health` → should return JSON.

Keep this URL — it's `ML_SERVICE_URL`.

---

## 3. Backend → Render (Express API)

1. Push your project to GitHub (already done: `webpenter/robert-long-upwork`).
2. Render Dashboard → **New → Blueprint** → select the repo. It reads
   `render.yaml` and creates the `enzyme-ml-backend` web service.
3. In the service's **Environment**, fill the `sync:false` vars:
   - `MONGODB_URI` = the Atlas string from step 1
   - `ML_SERVICE_URL` = the HF Space URL from step 2 (no trailing slash)
   - `FRONTEND_URL` = your Vercel URL from step 4 (come back and set this after step 4)
   - `JWT_SECRET` / `JWT_REFRESH_SECRET` = auto-generated, leave as-is
4. Deploy. When live, the API is at `https://enzyme-ml-backend.onrender.com`.
   Verify: `https://enzyme-ml-backend.onrender.com/api/health` → `{"status":"ok"}`.

### Seed the demo login (one time)

The app requires sign-in. Seed the built-in demo accounts using your Atlas
string. From your local `backend/` folder (or Render Shell):

```powershell
cd backend
$env:MONGODB_URI = "mongodb+srv://...your atlas string..."
npm run seed
```

Demo credentials created:
- **Scientist:** `demo@enzymeml.com` / `demo123`
- **Admin:** `admin@enzymeml.com` / `admin123`

Keep the backend URL — append `/api` for the frontend: `https://enzyme-ml-backend.onrender.com/api`

---

## 4. Frontend → Vercel (React/Vite static)

1. Vercel → **Add New → Project** → import the repo.
2. Vercel auto-detects Vite via `vercel.json` (build `npm run build`, output `dist`,
   SPA rewrite included).
3. **Environment Variables** → add:
   - `VITE_API_URL` = `https://enzyme-ml-backend.onrender.com/api`
   (Vite inlines this at **build time**, so set it before/redeploy after adding.)
4. Deploy. Your client link is `https://<project>.vercel.app`.
5. **Go back to Render** and set `FRONTEND_URL` to this Vercel URL, then redeploy
   the backend (CORS in production only allows this origin).

---

## Share with the client

Send them:
- **Link:** `https://<project>.vercel.app`
- **Login:** `demo@enzymeml.com` / `demo123`

## Free-tier caveats (tell the client)

- **Cold starts.** Render and the HF Space **sleep after inactivity**. The first
  request after idle takes ~30–60 s while they wake and the ML model reloads.
  Subsequent requests are fast. (Tip: open the backend `/api/health` and the
  Space `/health` URLs a minute before a demo to pre-warm them.)
- **AI chat is disabled** (no Anthropic key) — it returns a friendly notice;
  every other feature works.
- **Uploads are ephemeral** on Render free (lost on restart) — fine for testing.
- Atlas M0 = 512 MB storage, HF/Render free CPU — plenty for a demo, not production.

## Local development (unchanged)

```powershell
# ML service
cd ml-service; python -m uvicorn main:app --port 8000 --reload
# Backend (needs local .env from .env.example + local/Atlas Mongo)
cd backend; npm run dev
# Frontend
npm run dev
```
