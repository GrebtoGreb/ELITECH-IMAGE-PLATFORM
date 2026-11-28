# MVP roadmap

## 0.1 — Workspace and job intake
- [x] Two-panel browser workspace for source image and task options
- [x] Multi-select task operations, including Add a person
- [x] Provider selection: Magnific/Nano Banana, OpenAI, other
- [x] Protected-elements checklist
- [x] Prompt modes: manual, ChatGPT-assisted placeholder, template
- [x] Multiple reference uploads
- [x] Job Manifest preview
- [x] FastAPI upload and manifest persistence

## 0.2 — Job management read-only
- [x] Job history list with newest-first ordering
- [x] Search by job ID, source filename, and operation
- [x] Job detail view with source preview and metadata
- [x] Reference previews and links
- [x] Original prompt and protected-elements view
- [x] Download Job Manifest JSON
- [x] Read-only execution and publication safety indicators
- [x] Backend list, detail, and safe job-file read endpoints
- [x] Local smoke tests for history, search, detail, preview and manifest download

## 0.3 — Safe draft management
- [x] Edit DRAFT metadata without changing source or reference files
- [x] Duplicate a job with independent copies of source and references
- [x] Reset execution and publication flags on duplicated jobs
- [x] Archive and restore jobs without deleting their files
- [x] Active, archived and all-jobs views
- [x] Revision number and updated timestamp
- [x] Append-only JSONL audit events for create, edit, duplicate, archive and restore
- [x] Backend unit tests for edit, duplicate, archive, restore and safety restrictions
- [ ] Local API and UI smoke tests on the user's Mac

## 0.4 — Reliability and audit
- [ ] Automated frontend tests
- [ ] File signature validation in addition to MIME validation
- [ ] Configurable upload quotas and retention policy
- [ ] Persistent job index and status transitions
- [ ] Task profile compatibility rules
- [ ] UI for viewing and exporting the audit history

## 0.5 — Image pipeline
- [ ] Mask authoring and protected-region overlays
- [ ] Provider adapter interface with explicit dry-run
- [ ] Magnific and OpenAI API integrations
- [ ] Deterministic compositing and QC Engine v1.2 integration
- [ ] Result comparison and human approval

## 0.6 — Production workflow
- [ ] Version history for generated image assets
- [ ] Batch jobs
- [ ] Role-based access
- [ ] Controlled UPDATE gate; never publish automatically after generation
