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

## 0.2 — Job management (implemented; local smoke test pending)
- [x] Job history list with newest-first ordering
- [x] Search by job ID, source filename, and operation
- [x] Job detail view with source preview and metadata
- [x] Reference previews and links
- [x] Original prompt and protected-elements view
- [x] Download Job Manifest JSON
- [x] Read-only execution and publication safety indicators
- [x] Backend list, detail, and safe job-file read endpoints

## 0.3 — Reliability
- [ ] Automated frontend and backend tests
- [ ] File signature validation in addition to MIME validation
- [ ] Configurable upload quotas and retention policy
- [ ] Persistent job index and status transitions
- [ ] Task profile compatibility rules

## 0.4 — Image pipeline
- [ ] Mask authoring and protected-region overlays
- [ ] Provider adapter interface with explicit dry-run
- [ ] Magnific and OpenAI API integrations
- [ ] Deterministic compositing and QC Engine v1.2 integration
- [ ] Result comparison and human approval

## 0.5 — Production workflow
- [ ] Version history and audit log
- [ ] Batch jobs
- [ ] Role-based access
- [ ] Controlled UPDATE gate; never publish automatically after generation
