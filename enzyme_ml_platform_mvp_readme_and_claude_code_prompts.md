# Enzyme Stability ML Prediction Platform

# MVP Development README + Claude Code Prompts

---

# 1. Project Goal

Build an MVP (Minimum Viable Product) for an AI-powered enzyme stability prediction platform.

The system should allow scientists to:

- Upload or paste enzyme FASTA sequences
- Select target process conditions
- Generate predicted mutation suggestions
- View prediction confidence and activity risk
- Explore prediction dashboards and hotspot maps

This MVP should demonstrate:

- complete platform architecture understanding
- scalable backend structure
- ML-ready infrastructure
- scientific workflow handling
- frontend dashboards
- Python ML integration

This MVP does NOT need production-grade biology accuracy initially.

The primary goal is:

- architecture validation
- workflow validation
- UI/UX demonstration
- ML pipeline structure
- future scalability

---

# 2. MVP Scope

The MVP should include:

## Authentication System

- login/signup
- JWT authentication
- role-based access

## Dashboard System

- project/workspace management
- prediction history
- mutation tables
- visualization dashboard

## FASTA Upload & Validation

- sequence upload
- sequence parsing
- validation
- error handling

## Prediction Workflow

- condition input forms
- mutation generation
- mock ML prediction pipeline
- ranking engine
- confidence scoring

## Python ML Service

- FastAPI microservice
- sequence feature extraction
- dummy ML prediction model
- inference APIs

## Visualization Layer

- hotspot map
- prediction charts
- mutation ranking tables

## Report Export

- CSV export
- PDF export

---

# 3. Suggested Tech Stack

## Frontend


- React js
- TailwindCSS
- ShadCN UI
- Plotly.js

## Backend API

- Node.js
-  Express
- Prisma ORM
- PostgreSQL
- JWT Authentication

## Python ML Service

- FastAPI
- Pandas
- NumPy
- Scikit-learn
- BioPython

## Infrastructure

- Docker
- Docker Compose
- Redis
- BullMQ

---

# 4. Recommended Project Structure

```txt
apps/
  web/                → Next.js frontend
  api/                → Node.js backend
  ml-service/         → Python FastAPI ML service

packages/
  ui/
  database/
  shared/

infrastructure/
  docker/
  nginx/
  scripts/
```

---

# 5. End-to-End MVP Workflow

## Step 1 — User Authentication

User creates account.

System:

- authenticates user
- creates workspace
- manages RBAC permissions

---

## Step 2 — Create Prediction Project

User creates:

- project
- experiment session

Stores:

- project metadata
- timestamps
- prediction history

---

## Step 3 — FASTA Input

User:

- pastes FASTA sequence OR
- uploads FASTA file

System validates:

- invalid characters
- empty sequences
- formatting errors

---

## Step 4 — Process Conditions

User selects:

- temperature
- pH
- solvent
- ionic strength

Optional:

- mutation constraints
- proposed mutations

---

## Step 5 — Backend Processing

Frontend sends request to backend API.

Backend:

- validates request
- stores prediction request
- queues ML task

---

## Step 6 — Python ML Service

FastAPI service:

- receives sequence
- extracts features
- creates embeddings
- generates mutation candidates
- predicts scores
- returns ranked mutations

Initial MVP can use:

- dummy ML models
- random confidence scores
- simplified statistical models

---

## Step 7 — Results Dashboard

Frontend displays:

- ranked mutation table
- confidence scores
- activity-risk scores
- hotspot visualizations
- prediction metadata

---

## Step 8 — Export System

User exports:

- CSV reports
- PDF reports
- PNG charts

---

# 6. Database Schema MVP

## Users

```sql
id
name
email
password
role
created_at
```

## Projects

```sql
id
user_id
name
description
created_at
```

## Sequences

```sql
id
project_id
fasta_sequence
sequence_length
created_at
```

## PredictionRequests

```sql
id
project_id
temperature
ph
solvent
ionic_strength
status
created_at
```

## Predictions

```sql
id
request_id
mutation
stability_score
confidence_score
activity_risk
rank
created_at
```

---

# 7. Frontend Pages

## Authentication

- Login
- Register

## Dashboard

- Project list
- Prediction history
- Stats cards

## New Prediction

- FASTA input
- Conditions form
- Mutation constraints

## Results Page

- mutation rankings
- charts
- hotspot maps
- export buttons

## Settings

- profile
- API keys
- subscription tier

---

# 8. API Endpoints

## Auth

```txt
POST /auth/register
POST /auth/login
GET /auth/profile
```

## Projects

```txt
GET /projects
POST /projects
GET /projects/:id
```

## Predictions

```txt
POST /predictions
GET /predictions/:id
GET /predictions/project/:id
```

## ML Service

```txt
POST /ml/predict
POST /ml/feature-extract
```

---

# 9. Python ML Service Logic

The initial MVP ML service should:

## Validate Sequence

- check FASTA format
- validate amino acids

## Generate Features

Simple features:

- sequence length
- amino acid counts
- hydrophobicity estimates
- charge estimates

## Generate Mutation Candidates

Example:

```txt
A123V
L241P
G88R
```

## Mock Prediction Engine

Generate:

- stability score
- confidence score
- activity risk

Later replace with:

- PyTorch models
- ESM embeddings
- AlphaFold integration

---

# 10. Visualization Requirements

## Mutation Table

Columns:

- mutation
- stability score
- confidence
- activity risk
- ranking

## Charts

- score distribution
- mutation comparison
- confidence graphs

## Hotspot Map

Interactive sequence visualization.

---

# 11. Claude Code Development Prompts

---

# Prompt 1 — Full Stack Architecture Setup

```txt
Build a full-stack monorepo architecture for an Enzyme Stability ML Prediction Platform.

Requirements:
- Next.js frontend
- Node.js backend API
- Python FastAPI ML microservice
- PostgreSQL database
- Dockerized setup
- Redis queue system
- TypeScript support
- TailwindCSS
- Prisma ORM

The project should follow scalable modular architecture.

Generate:
- folder structure
- Docker setup
- environment configs
- shared types
- API communication setup
- database connection setup
- monorepo configuration
```

---

# Prompt 2 — Frontend Dashboard MVP

```txt
Build a modern scientific SaaS dashboard UI using Next.js, TailwindCSS, and TypeScript.

Requirements:
- authentication pages
- dashboard layout
- sidebar navigation
- FASTA upload form
- process conditions form
- prediction result table
- hotspot visualization placeholder
- responsive design
- dark/light mode

Use reusable components and scalable architecture.
```

---

# Prompt 3 — FASTA Validation System

```txt
Build a FASTA sequence validation system.

Requirements:
- validate amino acid sequences
- detect invalid characters
- support pasted FASTA input
- support uploaded FASTA files
- return validation errors
- return parsed sequence metadata

Build:
- frontend validation
- backend validation
- TypeScript utilities
- Python validation service
```

---

# Prompt 4 — Prediction Workflow System

```txt
Build a prediction request workflow.

Requirements:
- submit FASTA sequence
- submit process conditions
- store prediction requests
- queue ML prediction jobs
- process async prediction tasks
- return prediction results
- persist prediction history

Use:
- Redis
- BullMQ
- PostgreSQL
- FastAPI integration
```

---

# Prompt 5 — Python ML Service MVP

```txt
Build a FastAPI-based ML prediction service for enzyme mutation prediction.

Requirements:
- sequence parsing
- feature extraction
- mock embedding generation
- mutation candidate generation
- stability scoring
- confidence scoring
- activity-risk scoring

Use:
- FastAPI
- Pandas
- NumPy
- Scikit-learn
- BioPython

Return prediction results in JSON format.
```

---

# Prompt 6 — Mutation Ranking Dashboard

```txt
Build a mutation ranking dashboard.

Requirements:
- sortable mutation table
- confidence indicators
- activity-risk badges
- ranking system
- prediction metadata
- charts using Plotly
- responsive scientific UI

Use reusable React components.
```

---

# Prompt 7 — Hotspot Map Visualization

```txt
Build an interactive residue hotspot map visualization.

Requirements:
- visualize enzyme sequence positions
- highlight mutation hotspots
- show mutation scores
- hover interactions
- responsive UI

Use:
- Plotly.js or D3.js
```

---

# Prompt 8 — Report Export System

```txt
Build export functionality.

Requirements:
- export predictions to CSV
- export charts to PNG
- generate PDF report
- include mutation rankings
- include charts
- include metadata
```

---

# Prompt 9 — AI Assistant MVP

```txt
Build a basic AI assistant system for prediction explanation.

Requirements:
- chat interface
- prediction explanation
- reference prediction metadata
- explain mutation rankings
- explain confidence scores
- maintain session history

Use:
- OpenAI API
- retrieval-style architecture
- backend API integration
```

---

# Prompt 10 — Production Readiness

```txt
Improve the project for production readiness.

Requirements:
- API validation
- error handling
- logging
- rate limiting
- RBAC
- environment configuration
- Docker optimization
- security best practices
- API documentation
- testing setup
- CI/CD setup
```

---

# 12. Future Enhancements

Future versions may include:

- real ESM embeddings
- AlphaFold integration
- real protein structural analysis
- advanced PyTorch models
- scientific validation pipelines
- multi-model ensembling
- real-time retraining
- advanced AI scientific assistant
- SaaS billing system
- multi-tenant enterprise support

---

# 13. MVP Goal Summary

This MVP should demonstrate:

- strong system architecture understanding
- scalable SaaS engineering
- ML-ready infrastructure
- Python integration
- scientific workflow handling
- dashboard UX
- future extensibility

The MVP is intended to validate the platform direction and provide a strong technical foundation for future scientific and ML improvements.

---

# 14. Final Notes

The primary focus of this MVP is:

- engineering architecture
- workflow demonstration
- system scalability
- frontend/backend integration
- ML infrastructure readiness

Scientific prediction accuracy can be improved iteratively as:

- more biological data becomes available
- scientists provide validation
- models mature over time
- training datasets expand

