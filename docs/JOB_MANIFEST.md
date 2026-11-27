# Job Manifest v1.0.0

Each submitted job has an immutable source record and a JSON manifest.

| Field | Meaning |
|---|---|
| schema_version | Manifest schema version |
| job_id | Unique ELI-prefixed identifier |
| status | DRAFT at creation |
| created_at | UTC timestamp |
| source | Original uploaded file metadata |
| references | Optional reference-file metadata |
| operations | Array of selected operations |
| protected_elements | Array of protected visual elements |
| provider | Selected provider adapter key |
| prompt_mode | manual, assist or template |
| prompt_original | User-authored brief, unchanged |
| prompt_prepared | Reserved for separately generated prompt |
| template | Optional selected prompt template |
| execution | Flags confirming generation, QC and publication have not run |

The manifest does not store API keys or binary file contents. Files are stored beside the manifest in the job folder.
