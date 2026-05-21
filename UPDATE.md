# Enzyme Stability ML Prediction Platform — Project Update

---

## What Is This Project?

Imagine you are a scientist working in a laboratory. You have discovered an enzyme — a tiny biological machine inside living cells that speeds up chemical reactions. But there is a problem: your enzyme breaks down when it gets too hot, too acidic, or is placed in an industrial chemical environment. You need it to survive those harsh conditions.

Traditionally, to make an enzyme more stable, scientists would spend months doing trial-and-error experiments — changing one amino acid at a time, testing, failing, adjusting. It is slow and expensive.

**This platform uses AI to do that job in seconds.**

You paste your enzyme's genetic sequence into the app, tell it the conditions you need (temperature, pH, solvent), and the system instantly predicts which parts of the enzyme to change — and how — to make it more stable. It ranks all suggestions by confidence and risk, gives you visual hotspot maps, and lets you export a full report.

---

## Who Is This For?

- **Scientists and researchers** who work with enzymes in biology, chemistry, pharma, or food technology
- **Biotech startups** developing industrial enzymes for cleaning products, biofuels, medicine
- **Academic labs** studying protein engineering
- **Non-technical stakeholders** who want to understand what the platform does

---

## The Simple Story (Non-Technical)

1. You open the website and log in
2. You paste or upload your enzyme's sequence (a long string of letters like `IVGGYTCGAN...`)
3. You set the target conditions (e.g., "I need this enzyme to work at 55°C and pH 4.5")
4. You click **Run Prediction**
5. The system analyses your enzyme, generates 15 mutation suggestions, and scores each one
6. You see a ranked table, visual charts, and a colorful map of where changes should happen
7. You export a CSV report and take it to the lab

That's it. What used to take weeks of experiments is now a starting point ready in seconds.

---

## The Technical Story

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend UI | React 19 + Vite 8 | Fast, component-based modern web app |
| Styling | Tailwind CSS v4 | Utility-first CSS — rapid, consistent design |
| Routing | React Router v6 | Page navigation without full page reloads |
| Charts | Recharts | Responsive SVG bar charts and scatter plots |
| Icons | Lucide React | Clean, consistent icon set |
| State | React Context API | Lightweight global state — no Redux needed |
| Storage | Browser localStorage | Persistence without a backend (MVP phase) |
| ML Engine | JavaScript (mock) | Simulates real ML pipeline — swap in Python later |
| Export | Vanilla JS Blob API | CSV download with no external library |

---

## Project File Structure

```
src/
│
├── context/
│   ├── AuthContext.jsx       ← Manages who is logged in
│   └── AppContext.jsx        ← Manages projects and predictions data
│
├── services/
│   ├── mlService.js          ← The mock ML brain (FASTA parser + predictor)
│   └── exportService.js      ← Generates and downloads CSV reports
│
├── components/
│   ├── Layout.jsx            ← Page shell: sidebar + header + content area
│   ├── Sidebar.jsx           ← Left navigation menu
│   └── Header.jsx            ← Top bar with page title and user avatar
│
├── pages/
│   ├── Login.jsx             ← Sign-in screen
│   ├── Register.jsx          ← New account screen
│   ├── Dashboard.jsx         ← Home screen with stats + project list
│   ├── NewPrediction.jsx     ← 3-step prediction form
│   ├── Results.jsx           ← Full results: charts, hotspot map, table
│   └── Settings.jsx          ← Profile, API key, subscription
│
├── App.jsx                   ← Router setup and route protection
├── main.jsx                  ← App entry point
└── index.css                 ← Tailwind CSS import
```

---

## How Every Part Works — A to Z

---

### A — App Startup

When you open the browser and visit the app URL, this is what happens:

1. `main.jsx` loads — it mounts the React app into the HTML page
2. `App.jsx` wraps everything in two providers:
   - `AuthProvider` — checks localStorage to see if a user is already logged in
   - `AppProvider` — loads saved projects and predictions from localStorage
3. React Router reads the URL and decides which page to show
4. If you are not logged in and try to visit `/dashboard`, you are automatically redirected to `/login`

**Technical detail:** Route protection is done with `ProtectedRoute` and `PublicRoute` wrapper components in `App.jsx`. They check `user` from `AuthContext` and redirect accordingly.

---

### B — Authentication System

**File:** `src/context/AuthContext.jsx`

This manages the entire login/logout/register flow.

**How it works (non-technical):**
Think of it like a front desk security system. When you create an account, your details are stored. When you log in, the system checks your credentials and hands you a "pass" for that session. When you log out, the pass is revoked.

**How it works (technical):**
- User accounts are stored as an array in `localStorage` under the key `enzml_users`
- Passwords are stored in plain text (acceptable for MVP/demo — must be hashed with bcrypt in production)
- On login, the system finds the matching user object, strips the password, and stores the safe version in `enzml_user`
- `useAuth()` hook provides `{ user, login, register, logout, updateUser }` to any component
- The `AuthProvider` reads localStorage on mount (`useEffect`) so sessions persist across page refreshes

**Demo account:** `demo@enzymeml.com` / `demo123` — auto-created when you click "Try with Demo Account"

---

### C — App State and Demo Data

**File:** `src/context/AppContext.jsx`

This is the memory of the app — it stores all projects and prediction results.

**How it works (non-technical):**
Like a filing cabinet. Every project you create and every prediction you run gets filed here. Close the browser, open it again — everything is still there (stored in your browser's local storage).

**How it works (technical):**
- On mount, reads `enzml_projects` and `enzml_predictions` from localStorage
- If localStorage is empty (first visit), seeds 3 demo projects and 2 demo predictions automatically
- Exports `{ projects, predictions, addProject, addPrediction, getPrediction }`
- `getPrediction(id)` is used by the Results page to load prediction data by ID from the URL

**Pre-seeded demo data includes:**
- 3 projects (Trypsin Thermostability, Lipase pH Tolerance, Protease Salt Resistance)
- 2 completed predictions with 15 ranked mutations each

---

### D — Dashboard Page

**File:** `src/pages/Dashboard.jsx`

The home screen after login. Shows the big picture of your research.

**Non-technical:** Like a control panel — you see all your stats at a glance and can jump to any project or past prediction.

**Technical breakdown:**
- Reads `{ projects, predictions }` from `AppContext`
- Calculates live stats:
  - Total projects count
  - Total predictions count
  - Total mutations analyzed (sum of all prediction mutation arrays)
  - Average confidence (weighted average across all predictions)
- Renders 4 `StatCard` components with color-coded icons
- Two-column layout: Projects panel (left) + Recent Predictions list (right)
- Clicking a prediction navigates to `/results/:id`

---

### E — New Prediction Workflow

**File:** `src/pages/NewPrediction.jsx`

A 3-step guided form to submit a new prediction.

---

**Step 1 — FASTA Input**

**Non-technical:** You paste your enzyme's "genetic code" (a long string of letters representing amino acids). The system checks it is valid before proceeding.

**Technical:**
- Calls `parseFASTA(input)` from `mlService.js` to extract header line and sequence
- Calls `validateSequence(sequence)` in real-time as you type
- Validation checks:
  - Not empty
  - Minimum 10 amino acids
  - Maximum 5000 amino acids
  - Only valid single-letter amino acid codes (`ACDEFGHIKLMNPQRSTVWY`)
- If valid, shows a green info box with sequence stats (length, estimated MW, charged %, hydrophobicity)
- Also supports `.fasta` file upload via hidden `<input type="file">`
- A "Load sample sequence" button fills in real Trypsin FASTA for demo purposes

---

**Step 2 — Process Conditions**

**Non-technical:** You tell the system what environment your enzyme needs to survive in — like setting the temperature, acidity (pH), and type of liquid it will be in.

**Technical:**
- Temperature: range slider 20–90°C (default 37°C)
- pH: range slider 2.0–12.0 in 0.5 steps (default 7.0)
- Solvent: dropdown — aqueous / organic / mixed / ionic-liquid
- Ionic Strength: number input 0–1 M (default 0.15 M)
- Optional constraints textarea for notes like "exclude C34" or "prefer active site residues"
- All stored in `conditions` state object

---

**Step 3 — Running (Loading)**

**Non-technical:** The AI is working. You see a progress bar and status messages.

**Technical:**
- Calls `generatePrediction(fasta, conditions)` from `mlService.js`
- This returns a Promise that resolves after a simulated 2.5-second delay (mimics real async ML inference)
- An `setInterval` animates the progress bar from 0 → 90% during processing
- On resolution, jumps to 100%, calls `addPrediction(result)` to persist the result, then navigates to `/results/:id`

---

### F — The Mock ML Engine

**File:** `src/services/mlService.js`

The brain of the system. In the MVP this is a smart simulation — the architecture mirrors what a real ML service would do.

**Non-technical:** Think of it as an expert system that has been taught rules about amino acids — which ones are more stable at high temperatures, which substitutions are chemically conservative, and how conditions affect stability. It uses these rules to score proposed changes.

**Technical — step by step:**

#### 1. parseFASTA(input)
Splits input by newlines. Lines starting with `>` are headers. All other lines are concatenated into the sequence string (uppercased, whitespace removed).

#### 2. validateSequence(sequence)
Checks length bounds and character validity against `AMINO_ACIDS` set. Returns `{ valid, error }`.

#### 3. extractFeatures(sequence)
Calculates:
- Sequence length
- Amino acid composition (% of each of the 20 AAs)
- Average hydrophobicity (Kyte-Doolittle scale)
- Charged residue count (R, K, H, D, E)
- Aromatic residue count (F, W, Y)
- Proline content % (affects flexibility)
- Estimated molecular weight (average residue mass × length / 1000)

#### 4. selectPositions(sequence, count=15)
Selects 15 positions to mutate. Priority is given to functionally sensitive residues: C (cysteine), P (proline), G (glycine), H (histidine), D (aspartate), E (glutamate). Remaining positions are randomly selected.

#### 5. Mutation Scoring
For each position:
- Looks up conservative substitution preferences (e.g., L → I, V, M are conservative; L → W is radical)
- Calculates `tempStress = |T - 37| / 63` and `phStress = |pH - 7| / 7` as 0–1 penalty factors
- `stabilityScore = base_random + conservative_bonus - tempStress × 0.15 - phStress × 0.08`
- `confidence = random 0.45–0.99`
- `activityRisk = "Low" if stability > 0.70, "Medium" if > 0.45, else "High"`
- `ddG` = random ΔΔG value in kcal/mol (negative = stabilizing)

#### 6. Final Output Object
```js
{
  id, header, sequence, features,
  mutations: [{ rank, mutation, position, original, substitution,
                stabilityScore, confidence, activityRisk, ddG }],
  conditions, timestamp, status, model
}
```

**What replaces the mock in production:**
- Python FastAPI service with ESM-2 embeddings (Meta AI protein language model)
- Thermodynamic calculators (FoldX, Rosetta)
- AlphaFold2 structure prediction
- Trained neural network on experimental stability datasets

---

### G — Results Page

**File:** `src/pages/Results.jsx`

The most feature-rich page in the app.

**Non-technical:** Your prediction results — displayed as a clean report with charts, color maps, and a ranked table. Like getting a lab report but generated by AI in seconds.

**Technical sections:**

#### Metadata Card
- Shows protein name, conditions, date, model version
- Feature summary row: length, MW, charged %, aromatic, proline, hydrophobicity

#### Top 3 Mutation Cards
- Medal-style cards (gold/silver/bronze styling) for rank 1, 2, 3
- Each shows: mutation name, stability score bar, confidence bar, ΔΔG value, activity risk badge

#### Stability & Confidence Bar Chart (Recharts)
- `BarChart` with two `Bar` components — blue for stability, purple for confidence
- Shows top 10 mutations on X axis
- Labels rotated 45° for readability
- `ResponsiveContainer` makes it resize with the window

#### Hotspot Map (Custom SVG Component)
- Each amino acid position rendered as a 14×14px colored square
- Color logic:
  - Gray (`#e2e8f0`) = not mutated
  - Green (`#22c55e`) = stability > 70%
  - Amber (`#f59e0b`) = stability 45–70%
  - Red (`#ef4444`) = stability < 45%
- `onMouseEnter` shows a tooltip with position, residue, and mutation details
- Built as a pure React component using inline styles (no canvas/D3 needed)

#### Sortable Mutation Table
- All 15 mutations displayed
- Sortable by: Rank, Mutation, Stability Score, Confidence, Activity Risk, ΔΔG
- Clicking a column header toggles ascending/descending
- Each row has mini progress bars for stability and confidence scores
- Risk badges: green / amber / red

---

### H — Export System

**File:** `src/services/exportService.js`

**Non-technical:** One click and you get a spreadsheet-ready file with your full prediction report.

**Technical:**
- Builds a metadata header block (protein name, date, conditions, model)
- Converts mutation array to CSV rows
- Creates a `Blob` with `text/csv` MIME type
- Generates a temporary object URL with `URL.createObjectURL()`
- Programmatically clicks a hidden `<a>` element to trigger browser download
- Cleans up with `URL.revokeObjectURL()` immediately after

---

### I — Settings Page

**File:** `src/pages/Settings.jsx`

**Non-technical:** Manage your account details, view your API key, and see your subscription plan.

**Technical:**
- Profile form updates `AuthContext` via `updateUser()` which writes to both `enzml_user` and the `enzml_users` array in localStorage
- API key section shows/hides the mock key with eye icon toggle
- Copy button uses `navigator.clipboard.writeText()` with a visual confirmation state
- Subscription section shows mock plan tiers (Starter / Researcher / Enterprise)

---

## Data Flow — Full Lifecycle

```
User enters FASTA
        ↓
parseFASTA()         → extracts header + sequence string
        ↓
validateSequence()   → checks length + valid characters
        ↓
extractFeatures()    → calculates composition, hydrophobicity, MW
        ↓
selectPositions()    → picks 15 residues to mutate (priority + random)
        ↓
generatePrediction() → scores each mutation → sorts → ranks
        ↓
addPrediction()      → saves to AppContext + localStorage
        ↓
Navigate to /results/:id
        ↓
Results page reads prediction by ID → renders charts + table + hotspot map
        ↓
User exports CSV     → exportToCSV() → browser download
```

---

## Authentication Flow

```
Visit /dashboard (not logged in)
        ↓
ProtectedRoute redirects → /login
        ↓
User clicks "Try Demo" → demo user created in localStorage
        ↓
login() validates credentials → strips password → saves to enzml_user
        ↓
AuthContext updates user state
        ↓
PublicRoute on /login detects user → redirects → /dashboard
        ↓
Dashboard reads user from AuthContext → personalised greeting
```

---

## What is MOCK and What is REAL

| Feature | MVP Status | Production Replacement |
|---------|-----------|----------------------|
| Auth / JWT | Mock (localStorage) | Real JWT + bcrypt + PostgreSQL |
| ML Prediction | Mock (random scoring) | Python FastAPI + ESM-2 + Rosetta |
| Database | Browser localStorage | PostgreSQL + Prisma ORM |
| Job Queue | Synchronous (2.5s delay) | Redis + BullMQ async jobs |
| API | None (client-only) | Node.js / NestJS REST API |
| PDF Export | Not yet | Puppeteer or jsPDF |
| User permissions | Basic (role field) | Full RBAC middleware |

---

## How to Run the Project

### Prerequisites
- Node.js 18+ installed
- A terminal (Command Prompt, PowerShell, or VS Code Terminal)

### Steps

```bash
# 1. Go to the project folder
cd "Enzyme Stability ML Prediction Platform"

# 2. Install dependencies (only needed once)
npm install

# 3. Start the development server
npm run dev

# 4. Open your browser
# Visit: http://localhost:5173
```

### Login Options
- **Demo account:** `demo@enzymeml.com` / `demo123` — pre-populated dashboard
- **New account:** Register with any email and password (stored locally)

---

## The Roadmap — What Comes Next

### Phase 2 — Real Backend
- Node.js + NestJS API server
- PostgreSQL database with Prisma ORM
- Real JWT authentication with refresh tokens
- REST API for all CRUD operations

### Phase 3 — Real ML Service
- Python FastAPI microservice
- ESM-2 protein language model embeddings (Meta AI)
- Thermodynamic scoring with FoldX
- AlphaFold2 structure-based analysis
- Async job processing with Redis + BullMQ

### Phase 4 — Production
- Docker + Docker Compose for all services
- Nginx reverse proxy
- CI/CD pipeline
- RBAC (role-based access control)
- Multi-tenant enterprise support
- SaaS billing integration (Stripe)
- Advanced AI assistant for prediction explanation

---

## Summary

This platform is an **end-to-end MVP** that demonstrates:

1. A professional SaaS UI that scientists can actually use
2. A complete prediction workflow from FASTA input to ranked results
3. A modular ML pipeline architecture ready to swap in real models
4. Charts and visualizations appropriate for scientific data
5. Export capabilities for lab handoff
6. Scalable code structure ready for backend integration

The mock ML engine is intentionally a placeholder — the real value is the **architecture, the workflow, and the UI/UX**, which are production-ready and scientifically grounded.

---

*Generated: May 2026 | Platform: EnzymeML v1.0 MVP | Stack: React 19 + Vite 8 + Tailwind CSS v4*
