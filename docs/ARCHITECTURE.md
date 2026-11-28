# Architecture — ELITECH IMAGE PLATFORM

## Current MVP boundary
The browser application collects one source image, optional references, multiple operations, provider choice, protected elements and a prompt brief. FastAPI validates the request, stores uploads in a per-job folder and writes a JSON Job Manifest.

No AI provider is called during job creation or metadata editing. No source file is overwritten. There is no publish or marketplace UPDATE endpoint.

## Main components
- Frontend: React + TypeScript + Vite.
- API: FastAPI.
- Job storage: local filesystem, one folder per job.
- Manifest: JSON schema version 1.1.0; legacy 1.0.0 manifests remain readable.
- Audit: append-only audit_log.jsonl in each job folder.
- Future adapters: Magnific / Nano Banana, OpenAI image generation and other providers.
- Future pipeline: mask engine, deterministic compositing, ELITECH_IMAGE_QC_ENGINE and human approval.

## Job management API
- GET /api/jobs — active jobs by default.
- GET /api/jobs?archived_only=true — archived jobs.
- GET /api/jobs?include_archived=true — all jobs.
- GET /api/jobs/{job_id} — manifest details.
- GET /api/jobs/{job_id}/files/{filename} — safe read-only access to a job asset.
- PATCH /api/jobs/{job_id} — edit allowed draft metadata only.
- POST /api/jobs/{job_id}/duplicate — create a new draft and copy source/reference assets.
- POST /api/jobs/{job_id}/archive — archive without deleting files.
- POST /api/jobs/{job_id}/restore — restore an archived job.
- POST /api/jobs — create a new draft from uploads.

## Request lifecycle
1. User selects one source image.
2. User attaches optional references.
3. User selects one or more task operations.
4. User selects a provider and prompt preparation mode.
5. User defines protected elements and writes the original brief.
6. Frontend sends multipart form data to POST /api/jobs.
7. Backend validates files, stores assets and creates job_manifest.json.
8. UI displays the returned manifest.
9. An editable DRAFT may update only operations, protected elements, provider, prompt mode, prompt text and template.
10. Duplicate creates a new job ID and independent copies of source and reference files.
11. Archive/restore changes job visibility metadata; it never deletes the job folder or its assets.

## Safety invariants
- Original uploads and reference files are immutable after intake.
- PATCH rejects source, reference, execution, status and publication fields.
- Only DRAFT jobs that have not entered execution can be edited.
- Every metadata edit increments the revision and appends an audit event.
- Duplicates receive a new job ID and reset execution/QC/publication flags.
- Archive and restore never delete job files.
- Provider adapters are never called implicitly during job creation, editing or duplication.
- API credentials stay server-side in environment variables.
- QC failure blocks publication eligibility.
- Human approval is mandatory before any future production update.
- Original and prepared prompts are separate fields.
- Operations are multi-select; provider is a single selection.
- Automatic publication remains disabled.

## Next milestones
1. Add audit-history viewing and export.
2. Add automated frontend tests and stronger upload validation.
3. Add task profiles and mask authoring.
4. Integrate provider adapters with explicit dry-run.
5. Integrate deterministic compositing and QC v1.2.
6. Add result comparison, human approval and version history.
7. Add a controlled UPDATE gate.
