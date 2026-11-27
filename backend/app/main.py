from __future__ import annotations

import copy
import json
import mimetypes
import os
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(os.getenv("ELITECH_DATA_DIR", "./data")).resolve()
JOBS = ROOT / "jobs"
JOBS.mkdir(parents=True, exist_ok=True)

MAX_FILE_BYTES = 25 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
ALLOWED_REFERENCE_TYPES = ALLOWED_IMAGE_TYPES | {"application/pdf"}
ALLOWED_PROVIDERS = {"magnific_nano_banana", "openai", "other"}
ALLOWED_PROMPT_MODES = {"manual", "assist", "template"}
JOB_ID_PATTERN = re.compile(r"ELI-[A-F0-9]{12}")
JOB_LOCK = threading.RLock()

app = FastAPI(title="ELITECH IMAGE PLATFORM API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_list(value: str, field: str) -> list[str]:
    try:
        data = json.loads(value)
        if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
            raise ValueError()
        return data
    except Exception:
        raise HTTPException(422, f"{field} must be a JSON array of strings")


def safe_name(name: str) -> str:
    name = Path(name or "upload").name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return name[:120] or "upload"


async def store_upload(upload: UploadFile, folder: Path, allowed: set[str]) -> dict:
    if upload.content_type not in allowed:
        raise HTTPException(415, f"Unsupported file type: {upload.content_type}")
    payload = await upload.read(MAX_FILE_BYTES + 1)
    if not payload or len(payload) > MAX_FILE_BYTES:
        raise HTTPException(413, "Each file must be between 1 byte and 25 MB")
    name = safe_name(upload.filename or "upload")
    stored = f"{uuid.uuid4().hex[:10]}_{name}"
    (folder / stored).write_bytes(payload)
    return {
        "original_name": name,
        "stored_name": stored,
        "content_type": upload.content_type,
        "size_bytes": len(payload),
    }


def read_manifest(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def write_manifest(path: Path, manifest: dict) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def append_audit(folder: Path, event: dict) -> None:
    audit_path = folder / "audit_log.jsonl"
    with audit_path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, ensure_ascii=False) + "\n")


def validate_job_id(job_id: str) -> None:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise HTTPException(400, "Invalid job id")


def load_job(job_id: str) -> tuple[Path, Path, dict]:
    validate_job_id(job_id)
    folder = (JOBS / job_id).resolve()
    if folder.parent != JOBS.resolve() or not folder.is_dir():
        raise HTTPException(404, "Job not found")
    manifest_path = folder / "job_manifest.json"
    if not manifest_path.is_file():
        raise HTTPException(404, "Job manifest not found")
    manifest = read_manifest(manifest_path)
    if not manifest:
        raise HTTPException(500, "Job manifest is unreadable")
    return folder, manifest_path, manifest


def ensure_editable(manifest: dict) -> None:
    execution = manifest.get("execution") or {}
    if manifest.get("archived", False):
        raise HTTPException(409, "Archived jobs must be restored before editing")
    if manifest.get("status", "DRAFT") != "DRAFT":
        raise HTTPException(409, "Only DRAFT jobs can be edited")
    if execution.get("started") or execution.get("provider_called"):
        raise HTTPException(409, "A job that has entered execution cannot be edited")


def commit_manifest_change(
    folder: Path,
    manifest_path: Path,
    manifest: dict,
    action: str,
    changes: dict,
) -> dict:
    timestamp = now_iso()
    manifest["schema_version"] = "1.1.0"
    manifest["updated_at"] = timestamp
    try:
        manifest["revision"] = max(1, int(manifest.get("revision", 1))) + 1
    except (TypeError, ValueError):
        manifest["revision"] = 2

    event = {
        "timestamp": timestamp,
        "job_id": manifest["job_id"],
        "revision": manifest["revision"],
        "action": action,
        "changes": changes,
    }
    append_audit(folder, event)
    write_manifest(manifest_path, manifest)
    return manifest


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "elitech-image-platform-api",
        "version": "0.3.0",
    }


@app.post("/api/jobs")
async def create_job(
    source: Annotated[UploadFile, File()],
    references: Annotated[list[UploadFile] | None, File()] = None,
    operations: Annotated[str, Form()] = "[]",
    protected_elements: Annotated[str, Form()] = "[]",
    provider: Annotated[str, Form()] = "magnific_nano_banana",
    prompt: Annotated[str, Form()] = "",
    prompt_mode: Annotated[str, Form()] = "manual",
    template: Annotated[str, Form()] = "",
):
    ops = parse_list(operations, "operations")
    protected = parse_list(protected_elements, "protected_elements")
    if not ops:
        raise HTTPException(422, "Select at least one operation")
    if not prompt.strip():
        raise HTTPException(422, "Prompt / technical brief is required")
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(422, "Unknown provider")
    if prompt_mode not in ALLOWED_PROMPT_MODES:
        raise HTTPException(422, "Unknown prompt mode")

    job_id = "ELI-" + uuid.uuid4().hex[:12].upper()
    folder = JOBS / job_id
    folder.mkdir(parents=True)
    created_at = now_iso()
    source_meta = await store_upload(source, folder, ALLOWED_IMAGE_TYPES)
    ref_meta = [
        await store_upload(item, folder, ALLOWED_REFERENCE_TYPES)
        for item in (references or [])
    ]
    manifest = {
        "schema_version": "1.1.0",
        "job_id": job_id,
        "status": "DRAFT",
        "created_at": created_at,
        "updated_at": created_at,
        "revision": 1,
        "archived": False,
        "archived_at": None,
        "source": source_meta,
        "references": ref_meta,
        "operations": ops,
        "protected_elements": protected,
        "provider": provider,
        "prompt_mode": prompt_mode,
        "prompt_original": prompt,
        "prompt_prepared": None,
        "template": template or None,
        "execution": {
            "started": False,
            "provider_called": False,
            "qc_passed": False,
            "human_approval_required": True,
            "publication_eligible": False,
        },
    }
    write_manifest(folder / "job_manifest.json", manifest)
    append_audit(
        folder,
        {
            "timestamp": created_at,
            "job_id": job_id,
            "revision": 1,
            "action": "CREATED",
            "changes": {},
        },
    )
    return manifest


@app.get("/api/jobs")
def list_jobs(
    limit: int = Query(default=100, ge=1, le=500),
    include_archived: bool = Query(default=False),
    archived_only: bool = Query(default=False),
):
    folders = sorted(
        (folder for folder in JOBS.iterdir() if folder.is_dir()),
        key=lambda folder: folder.stat().st_mtime,
        reverse=True,
    )
    items = []
    total = 0

    for folder in folders:
        manifest = read_manifest(folder / "job_manifest.json")
        if not manifest:
            continue
        is_archived = bool(manifest.get("archived", False))
        if archived_only and not is_archived:
            continue
        if not archived_only and not include_archived and is_archived:
            continue

        total += 1
        if len(items) >= limit:
            continue
        items.append(
            {
                "job_id": manifest.get("job_id", folder.name),
                "status": manifest.get("status", "UNKNOWN"),
                "created_at": manifest.get("created_at", ""),
                "updated_at": manifest.get("updated_at", manifest.get("created_at", "")),
                "revision": manifest.get("revision", 1),
                "archived": is_archived,
                "source": manifest.get("source") or {},
                "operations": manifest.get("operations") or [],
                "provider": manifest.get("provider", "unknown"),
                "references_count": len(manifest.get("references") or []),
            }
        )

    return {"items": items, "total": total, "limit": limit}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    _, _, manifest = load_job(job_id)
    manifest.setdefault("archived", False)
    manifest.setdefault("revision", 1)
    manifest.setdefault("updated_at", manifest.get("created_at", ""))
    return manifest


@app.patch("/api/jobs/{job_id}")
def update_job(job_id: str, payload: dict):
    if not isinstance(payload, dict) or not payload:
        raise HTTPException(422, "A non-empty JSON object is required")

    allowed_fields = {
        "operations",
        "protected_elements",
        "provider",
        "prompt_mode",
        "prompt_original",
        "template",
    }
    unknown_fields = set(payload) - allowed_fields
    if unknown_fields:
        raise HTTPException(
            422,
            "Unsupported or immutable fields: " + ", ".join(sorted(unknown_fields)),
        )

    with JOB_LOCK:
        folder, manifest_path, manifest = load_job(job_id)
        ensure_editable(manifest)
        changes = {}

        for field, value in payload.items():
            if field in {"operations", "protected_elements"}:
                if not isinstance(value, list) or not all(
                    isinstance(item, str) and item.strip() for item in value
                ):
                    raise HTTPException(422, f"{field} must be an array of non-empty strings")
                if field == "operations" and not value:
                    raise HTTPException(422, "Select at least one operation")
                value = list(dict.fromkeys(item.strip() for item in value))
            elif field == "provider":
                if value not in ALLOWED_PROVIDERS:
                    raise HTTPException(422, "Unknown provider")
            elif field == "prompt_mode":
                if value not in ALLOWED_PROMPT_MODES:
                    raise HTTPException(422, "Unknown prompt mode")
            elif field == "prompt_original":
                if not isinstance(value, str) or not value.strip():
                    raise HTTPException(422, "Prompt / technical brief is required")
                if len(value) > 20000:
                    raise HTTPException(422, "Prompt / technical brief is too long")
            elif field == "template":
                if value is not None and not isinstance(value, str):
                    raise HTTPException(422, "template must be a string or null")
                if isinstance(value, str):
                    value = value.strip() or None

            previous = manifest.get(field)
            if previous != value:
                changes[field] = {"before": previous, "after": value}
                manifest[field] = value

        if not changes:
            return manifest

        return commit_manifest_change(
            folder,
            manifest_path,
            manifest,
            "UPDATED",
            changes,
        )


def copy_job_file(source_folder: Path, target_folder: Path, metadata: dict) -> None:
    stored_name = metadata.get("stored_name")
    if not isinstance(stored_name, str) or not stored_name or Path(stored_name).name != stored_name:
        raise HTTPException(409, "Job contains invalid file metadata")
    source_path = (source_folder / stored_name).resolve()
    if source_path.parent != source_folder.resolve() or not source_path.is_file():
        raise HTTPException(409, f"Required source file is missing: {stored_name}")
    shutil.copy2(source_path, target_folder / stored_name)


@app.post("/api/jobs/{job_id}/duplicate")
def duplicate_job(job_id: str):
    with JOB_LOCK:
        source_folder, _, source_manifest = load_job(job_id)
        new_id = "ELI-" + uuid.uuid4().hex[:12].upper()
        target_folder = JOBS / new_id
        target_folder.mkdir(parents=True)

        try:
            copy_job_file(source_folder, target_folder, source_manifest.get("source") or {})
            for reference in source_manifest.get("references") or []:
                copy_job_file(source_folder, target_folder, reference)

            manifest = copy.deepcopy(source_manifest)
            created_at = now_iso()
            manifest.update(
                {
                    "schema_version": "1.1.0",
                    "job_id": new_id,
                    "status": "DRAFT",
                    "created_at": created_at,
                    "updated_at": created_at,
                    "revision": 1,
                    "archived": False,
                    "archived_at": None,
                    "duplicated_from": job_id,
                    "execution": {
                        "started": False,
                        "provider_called": False,
                        "qc_passed": False,
                        "human_approval_required": True,
                        "publication_eligible": False,
                    },
                }
            )
            write_manifest(target_folder / "job_manifest.json", manifest)
            append_audit(
                target_folder,
                {
                    "timestamp": created_at,
                    "job_id": new_id,
                    "revision": 1,
                    "action": "DUPLICATED",
                    "duplicated_from": job_id,
                    "changes": {},
                },
            )
            return manifest
        except Exception:
            shutil.rmtree(target_folder, ignore_errors=True)
            raise


def set_archived(job_id: str, archived: bool) -> dict:
    with JOB_LOCK:
        folder, manifest_path, manifest = load_job(job_id)
        current = bool(manifest.get("archived", False))
        if current == archived:
            return manifest

        execution = manifest.get("execution") or {}
        if archived and manifest.get("status") == "PROCESSING":
            raise HTTPException(409, "A processing job cannot be archived")
        if archived and execution.get("started") and not execution.get("provider_called"):
            raise HTTPException(409, "A job entering execution cannot be archived")

        timestamp = now_iso()
        previous_archived_at = manifest.get("archived_at")
        manifest["archived"] = archived
        manifest["archived_at"] = timestamp if archived else None
        return commit_manifest_change(
            folder,
            manifest_path,
            manifest,
            "ARCHIVED" if archived else "RESTORED",
            {
                "archived": {"before": current, "after": archived},
                "archived_at": {"before": previous_archived_at, "after": manifest["archived_at"]},
            },
        )


@app.post("/api/jobs/{job_id}/archive")
def archive_job(job_id: str):
    return set_archived(job_id, True)


@app.post("/api/jobs/{job_id}/restore")
def restore_job(job_id: str):
    return set_archived(job_id, False)


@app.get("/api/jobs/{job_id}/files/{filename}")
def get_job_file(job_id: str, filename: str):
    validate_job_id(job_id)
    if not filename or filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid file name")
    folder = (JOBS / job_id).resolve()
    if folder.parent != JOBS.resolve():
        raise HTTPException(404, "Job not found")
    path = (folder / filename).resolve()
    if path.parent != folder or not path.is_file():
        raise HTTPException(404, "Job file not found")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return Response(
        content=path.read_bytes(),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{path.name}"'},
    )
