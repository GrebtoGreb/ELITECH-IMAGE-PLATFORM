# Job Manifest v1.1.0

Each submitted job has an immutable source record and a JSON manifest. Existing v1.0.0 manifests remain readable; fields introduced in v1.1.0 are optional when reading legacy jobs.

| Field | Meaning |
|---|---|
| schema_version | Manifest schema version |
| job_id | Unique ELI-prefixed identifier |
| status | DRAFT at creation; execution states are reserved for later milestones |
| created_at | UTC timestamp |
| updated_at | UTC timestamp of the last metadata or archive change |
| revision | Monotonically increasing manifest revision |
| archived | Whether the job is hidden from the active queue |
| archived_at | UTC timestamp of archival, otherwise null |
| duplicated_from | Source job ID when this job was created as a duplicate |
| source | Original uploaded file metadata; immutable after intake |
| references | Optional reference-file metadata; immutable after intake |
| operations | Array of selected operations |
| protected_elements | Array of protected visual elements |
| provider | Selected provider adapter key |
| prompt_mode | manual, assist or template |
| prompt_original | User-authored brief |
| prompt_prepared | Reserved for separately generated prompt |
| template | Optional selected prompt template |
| execution | Flags confirming generation, QC and publication state |

The manifest does not store API keys or binary file contents. Files are stored beside the manifest in the job folder.

## Safe metadata editing
Only DRAFT jobs that have not entered execution can be edited. The PATCH endpoint accepts only operations, protected_elements, provider, prompt_mode, prompt_original and template. Source, reference and execution metadata cannot be changed through this endpoint.

Each successful edit increments revision and appends an event to audit_log.jsonl. Archive and restore operations also increment the revision and append audit events.

## Duplication
A duplicate receives a new job ID, a new job folder and independent copies of the source and reference files. It starts as DRAFT with execution, QC and publication flags reset. The original job is not modified.

## Archive
Archiving sets archived and archived_at; it does not delete the job folder or any files. Restoring clears the archive fields. Legacy manifests without archived are treated as active.
