# ELITECH IMAGE PLATFORM

Browser-based workspace for controlled AI image editing, quality assurance and approval workflows.

## Product direction

The first release is a local-first MVP with a two-step workflow:

1. **Choose the source image** — upload one original image and optional reference files.
2. **Configure the task** — select one or more operations, choose an AI provider, define protected elements, and write or prepare a prompt / technical brief.

The app creates a versioned **Job Manifest**. Image generation and production integrations are deliberately isolated behind provider adapters and are not called by the MVP UI.

## MVP scope

- React + TypeScript + Vite frontend.
- FastAPI backend.
- Single source image per job; multiple optional reference files.
- Multi-select operations, including **Add a person**.
- Providers: Nano Banana via Magnific, ChatGPT / OpenAI, and a configurable third-party provider placeholder.
- Prompt modes: manual, ChatGPT-assisted (UI placeholder until API configuration), and template.
- Protected-element checklist.
- Job Manifest preview and JSON export.
- Backend health endpoint and job creation endpoint.
- No automatic publishing or marketplace updates.

## Repository layout

```text
frontend/       React + TypeScript browser application
backend/        FastAPI service and Job Manifest schema
docs/           architecture, workflow and implementation notes
```

## Run locally

### Frontend

Requirements: Node.js 20+

```bash
cd frontend
npm install
npm run dev
```

### Backend

Requirements: Python 3.10+

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The frontend defaults to the backend at `http://localhost:8000`. Set `VITE_API_BASE_URL` in `frontend/.env.local` if needed.

## Safety and workflow rules

- Original files are never overwritten.
- API keys must stay server-side and must never be committed.
- A job is a draft until explicitly submitted.
- Provider integrations must be explicit, independently configurable adapters.
- QC failure blocks publication eligibility.
- Human approval is required before any future UPDATE / publication step.
- Existing ELITECH brand assets, logos, footers and product geometry must be protected according to the selected task profile.

## Current status

Repository scaffold initialized. AI provider execution, persistent storage, authentication, mask editing and production deployment are future milestones.
