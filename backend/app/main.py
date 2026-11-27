from __future__ import annotations
import json, os, re, uuid, mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, Response
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(os.getenv("ELITECH_DATA_DIR", "./data")).resolve()
JOBS = ROOT / "jobs"
JOBS.mkdir(parents=True, exist_ok=True)
MAX_FILE_BYTES = 25 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
ALLOWED_REFERENCE_TYPES = ALLOWED_IMAGE_TYPES | {"application/pdf"}

app = FastAPI(title="ELITECH IMAGE PLATFORM API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","), allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["*"])


def parse_list(value: str, field: str) -> list[str]:
    try:
        data = json.loads(value)
        if not isinstance(data, list) or not all(isinstance(x, str) for x in data):
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
    return {"original_name": name, "stored_name": stored, "content_type": upload.content_type, "size_bytes": len(payload)}


def read_manifest(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


@app.get("/health")
def health():
    return {"status": "ok", "service": "elitech-image-platform-api", "version": "0.2.0"}


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
    if not ops: raise HTTPException(422, "Select at least one operation")
    if not prompt.strip(): raise HTTPException(422, "Prompt / technical brief is required")
    if provider not in {"magnific_nano_banana", "openai", "other"}: raise HTTPException(422, "Unknown provider")
    if prompt_mode not in {"manual", "assist", "template"}: raise HTTPException(422, "Unknown prompt mode")

    job_id = "ELI-" + uuid.uuid4().hex[:12].upper()
    folder = JOBS / job_id
    folder.mkdir(parents=True)
    source_meta = await store_upload(source, folder, ALLOWED_IMAGE_TYPES)
    ref_meta = [await store_upload(item, folder, ALLOWED_REFERENCE_TYPES) for item in (references or [])]
    manifest = {
        "schema_version": "1.0.0", "job_id": job_id, "status": "DRAFT",
        "created_at": datetime.now(timezone.utc).isoformat(), "source": source_meta,
        "references": ref_meta, "operations": ops, "protected_elements": protected,
        "provider": provider, "prompt_mode": prompt_mode, "prompt_original": prompt,
        "prompt_prepared": None, "template": template or None,
        "execution": {"started": False, "provider_called": False, "qc_passed": False, "human_approval_required": True, "publication_eligible": False},
    }
    (folder / "job_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


@app.get("/api/jobs")
def list_jobs(limit: int = Query(default=100, ge=1, le=500)):
    folders = sorted((folder for folder in JOBS.iterdir() if folder.is_dir()), key=lambda folder: folder.stat().st_mtime, reverse=True)
    items = []
    total = 0
    for folder in folders:
        manifest = read_manifest(folder / "job_manifest.json")
        if not manifest: continue
        total += 1
        if len(items) >= limit: continue
        items.append({
            "job_id": manifest.get("job_id", folder.name), "status": manifest.get("status", "UNKNOWN"),
            "created_at": manifest.get("created_at", ""), "source": manifest.get("source") or {},
            "operations": manifest.get("operations") or [], "provider": manifest.get("provider", "unknown"),
            "references_count": len(manifest.get("references") or []),
        })
    return {"items": items, "total": total, "limit": limit}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    if not re.fullmatch(r"ELI-[A-F0-9]{12}", job_id): raise HTTPException(400, "Invalid job id")
    path = JOBS / job_id / "job_manifest.json"
    if not path.exists(): raise HTTPException(404, "Job not found")
    manifest = read_manifest(path)
    if not manifest: raise HTTPException(500, "Job manifest is unreadable")
    return manifest


@app.get("/api/jobs/{job_id}/files/{filename}")
def get_job_file(job_id: str, filename: str):
    if not re.fullmatch(r"ELI-[A-F0-9]{12}", job_id): raise HTTPException(400, "Invalid job id")
    if not filename or filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid file name")
    folder = (JOBS / job_id).resolve()
    path = (folder / filename).resolve()
    if path.parent != folder or not path.is_file(): raise HTTPException(404, "Job file not found")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return Response(content=path.read_bytes(), media_type=media_type, headers={"Content-Disposition": f'inline; filename="{path.name}"'})
