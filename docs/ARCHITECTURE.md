# Architecture — ELITECH IMAGE PLATFORM

## Current MVP boundary
The browser application collects one source image, optional references, multiple operations, provider choice, protected elements and a prompt brief. FastAPI validates the request, stores uploads in a per-job folder and writes a versioned JSON Job Manifest.

No AI provider is called in this milestone. No source file is overwritten. There is no publish or marketplace UPDATE endpoint.

## Main components
- Frontend: React + TypeScript + Vite.
- API: FastAPI with multipart upload.
- Job storage: local filesystem, one folder per job.
- Manifest: JSON schema version 1.0.0.
- Future adapters: Magnific / Nano Banana, OpenAI image generation and other providers.
- Future pipeline: mask engine, deterministic compositing, ELITECH_IMAGE_QC_ENGINE and human approval.

## Request lifecycle
1. User selects one source image.
2. User attaches optional references.
3. User selects one or more task operations.
4. User selects a provider and prompt preparation mode.
5. User defines protected elements and writes the original brief.
6. Frontend sends multipart form data to POST /api/jobs.
7. Backend validates files, stores assets and creates job_manifest.json.
8. UI displays the returned manifest.

## Safety invariants
- Original uploads are immutable; generated outputs use new filenames.
- Provider adapters are never called implicitly during job creation.
- API credentials stay server-side in environment variables.
- QC failure blocks publication eligibility.
- Human approval is mandatory before any future production update.
- Original and prepared prompts are separate fields.
- Operations are multi-select; provider is a single selection.

## Next milestones
1. Add automated backend and frontend tests.
2. Add explicit provider adapter interfaces and dry-run capability.
3. Add task profiles and mask authoring.
4. Integrate deterministic compositing and QC v1.2.
5. Add review, approval and version history.
6. Add a controlled UPDATE gate.
