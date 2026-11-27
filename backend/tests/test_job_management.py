import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from app import main


class JobManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.previous_jobs = main.JOBS
        main.JOBS = Path(self.temp_dir.name) / "jobs"
        main.JOBS.mkdir(parents=True)
        self.job_id = "ELI-123456ABCDEF"
        self.folder = main.JOBS / self.job_id
        self.folder.mkdir()
        (self.folder / "original.jpg").write_bytes(b"original-image-bytes")
        (self.folder / "reference.png").write_bytes(b"reference-image-bytes")
        self.manifest = {
            "schema_version": "1.0.0",
            "job_id": self.job_id,
            "status": "DRAFT",
            "created_at": "2026-11-27T10:00:00+00:00",
            "source": {
                "original_name": "original.jpg",
                "stored_name": "original.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 20,
            },
            "references": [{
                "original_name": "reference.png",
                "stored_name": "reference.png",
                "content_type": "image/png",
                "size_bytes": 21,
            }],
            "operations": ["Замена фона"],
            "protected_elements": ["Товар и его конструкция"],
            "provider": "magnific_nano_banana",
            "prompt_mode": "manual",
            "prompt_original": "Исходное техническое задание",
            "prompt_prepared": None,
            "template": None,
            "execution": {
                "started": False,
                "provider_called": False,
                "qc_passed": False,
                "human_approval_required": True,
                "publication_eligible": False,
            },
        }
        main.write_manifest(self.folder / "job_manifest.json", self.manifest)

    def tearDown(self):
        main.JOBS = self.previous_jobs
        self.temp_dir.cleanup()

    def test_edit_changes_only_allowed_metadata_and_preserves_original(self):
        original_bytes = (self.folder / "original.jpg").read_bytes()
        updated = main.update_job(self.job_id, {
            "operations": ["Замена фона", "Улучшение освещения"],
            "prompt_original": "Новое техническое задание",
        })

        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["schema_version"], "1.1.0")
        self.assertEqual(updated["operations"], ["Замена фона", "Улучшение освещения"])
        self.assertEqual((self.folder / "original.jpg").read_bytes(), original_bytes)

        events = [
            json.loads(line)
            for line in (self.folder / "audit_log.jsonl").read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual(events[-1]["action"], "UPDATED")
        self.assertIn("prompt_original", events[-1]["changes"])

    def test_duplicate_copies_assets_and_resets_execution(self):
        duplicated = main.duplicate_job(self.job_id)
        new_id = duplicated["job_id"]
        new_folder = main.JOBS / new_id

        self.assertNotEqual(new_id, self.job_id)
        self.assertEqual(duplicated["status"], "DRAFT")
        self.assertEqual(duplicated["duplicated_from"], self.job_id)
        self.assertFalse(duplicated["execution"]["started"])
        self.assertFalse(duplicated["execution"]["provider_called"])
        self.assertEqual(
            (new_folder / "original.jpg").read_bytes(),
            (self.folder / "original.jpg").read_bytes(),
        )
        self.assertEqual(
            (new_folder / "reference.png").read_bytes(),
            (self.folder / "reference.png").read_bytes(),
        )
        self.assertTrue((new_folder / "audit_log.jsonl").is_file())

    def test_archive_and_restore_control_list_visibility(self):
        archived = main.archive_job(self.job_id)
        self.assertTrue(archived["archived"])
        self.assertEqual(main.list_jobs(limit=100, include_archived=False, archived_only=False)["total"], 0)
        self.assertEqual(main.list_jobs(limit=100, include_archived=False, archived_only=True)["total"], 1)

        restored = main.restore_job(self.job_id)
        self.assertFalse(restored["archived"])
        self.assertEqual(main.list_jobs(limit=100)["total"], 1)

    def test_source_and_execution_fields_are_not_editable(self):
        with self.assertRaises(HTTPException) as raised:
            main.update_job(self.job_id, {"source": {"stored_name": "other.jpg"}})
        self.assertEqual(raised.exception.status_code, 422)

    def test_only_drafts_can_be_edited(self):
        changed = dict(self.manifest)
        changed["status"] = "APPROVED"
        main.write_manifest(self.folder / "job_manifest.json", changed)

        with self.assertRaises(HTTPException) as raised:
            main.update_job(self.job_id, {"prompt_original": "Попытка изменить"})
        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
