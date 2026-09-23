#!/usr/bin/env python3
"""Meaningful installer safety tests; all project writes use temporary fixtures."""

import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile


BUILDER_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build-installer.py"
SPEC = importlib.util.spec_from_file_location("installer_builder", BUILDER_PATH)
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="dvy-installer-test-")
        self.home = Path(self.temporary.name)
        self.repo = self.home / "repo"
        self.repo.mkdir()
        self.write("package.json", '{"name":"workspace","scripts":{"build:dvy":"echo built"}}\n')
        self.write("pnpm-workspace.yaml", "packages:\n  - artifacts/*\n")
        self.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n# fixture baseline\n")
        self.write("artifacts/api-server/package.json", '{"name":"api"}\n')
        self.write("artifacts/mockup-sandbox/package.json", '{"name":"ui"}\n')
        self.write("app.txt", "original app\n")
        self.write(".gitignore", "node_modules/\n*.log\nignored.txt\n")
        self.git("init", "-q")
        self.git("add", ".")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "base")
        self.target = self.home / "target"
        shutil.copytree(self.repo, self.target, ignore=shutil.ignore_patterns(".git"))
        self.write("app.txt", "improved app\n")
        self.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n# fixture bundled update\n")
        self.write("src/new.txt", "new feature\n")
        self.installer = self.home / "actualizar.sh"
        self.build()

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *arguments):
        return subprocess.run(["git", "-C", str(self.repo), *arguments], check=True, capture_output=True)

    def write(self, name, value):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)

    def build(self):
        with patch("sys.stdout", new=io.StringIO()):
            BUILDER.build(self.repo, self.installer)

    def run_installer(self, *arguments, env=None):
        return subprocess.run(["bash", str(self.installer), *arguments], cwd=self.target, env=env, capture_output=True, text=True)

    def snapshot(self):
        return {p.relative_to(self.target).as_posix(): p.read_bytes() for p in self.target.rglob("*") if p.is_file() and not p.is_symlink()}

    def backups(self):
        return sorted((self.target / ".devuelveloya-backups").glob("*/manifest.json"))

    def restore(self):
        helper = self.backups()[0].parent / "restaurar.py"
        return subprocess.run([sys.executable, str(helper)], cwd=self.target, capture_output=True, text=True)

    def runtime(self):
        namespace = {}
        exec(BUILDER.RUNTIME, namespace)
        return namespace

    def drift_lock(self):
        content = "lockfileVersion: '9.0'\n# current user resolutions\n"
        (self.target / "pnpm-lock.yaml").write_text(content)
        return content

    def reconciliation_stub(self, fail_phase=None):
        binary = self.home / "reconcile-bin"
        binary.mkdir(exist_ok=True)
        pnpm = binary / "pnpm"
        pnpm.write_text("#!" + sys.executable + "\n" + r'''
import json
import os
from pathlib import Path
import sys

args = sys.argv[1:]
lock = Path("pnpm-lock.yaml")
phase = "resolve" if "--lockfile-only" in args else "install" if args and args[0] == "install" else "build"
with open(os.environ["PNPM_CALLS"], "a", encoding="utf-8") as stream:
    stream.write(json.dumps({"args": args, "cwd": str(Path.cwd()), "lock": lock.read_text(), "phase": phase}) + "\n")
if phase == "resolve":
    assert "--ignore-scripts" in args, "resolution must not execute project scripts"
    assert "--no-frozen-lockfile" in args, "resolution must reconcile the current lock"
    assert Path.cwd() != Path(os.environ["TARGET_PROJECT"]), "resolution must use an isolated stage"
    assert Path("package.json").is_file()
    assert Path("artifacts/api-server/package.json").is_file()
    assert Path("artifacts/mockup-sandbox/package.json").is_file()
    assert Path("pnpm-workspace.yaml").is_file()
    assert not Path("app.txt").exists(), "stage must not copy unrelated project content"
    lock.write_text(os.environ["LOCK_CANDIDATE"])
elif phase == "install":
    assert "--frozen-lockfile" in args, "install must use the staged, reconciled lock"
if phase == os.environ.get("FAIL_PHASE"):
    sys.exit(37)
''')
        pnpm.chmod(0o755)
        calls = self.home / "reconcile-calls.jsonl"
        candidate = "lockfileVersion: '9.0'\n# reconciled current user resolutions\n"
        env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"], "PNPM_CALLS": str(calls), "TARGET_PROJECT": str(self.target), "LOCK_CANDIDATE": candidate, "FAIL_PHASE": fail_phase or ""}
        return env, calls, candidate

    def read_calls(self, path):
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def payload(self):
        text = self.installer.read_text()
        # Parse literal assignments without executing the generated shell file.
        import ast
        start = text.index("PAYLOAD = ") + len("PAYLOAD = ")
        value = ast.literal_eval(text[start:].splitlines()[0])
        return base64.b64decode(value)

    def test_dry_run_is_read_only(self):
        before = self.snapshot()
        result = self.run_installer("--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, self.snapshot())
        self.assertFalse((self.target / ".devuelveloya-backups").exists())

    def test_apply_is_idempotent_and_restore_preserves_unrelated_files(self):
        (self.target / "unrelated.txt").write_text("keep me")
        first = self.run_installer("--skip-build")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual((self.target / "app.txt").read_text(), "improved app\n")
        after = self.snapshot()
        second = self.run_installer("--skip-build")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(after, self.snapshot())
        self.assertEqual(len(self.backups()), 1)
        restored = self.restore()
        self.assertEqual(restored.returncode, 0, restored.stderr)
        self.assertEqual((self.target / "app.txt").read_text(), "original app\n")
        self.assertFalse((self.target / "src/new.txt").exists())
        self.assertEqual((self.target / "unrelated.txt").read_text(), "keep me")
        self.assertEqual(self.restore().returncode, 0)

    def test_existing_user_change_aborts_everything(self):
        (self.target / "src").mkdir()
        (self.target / "src/new.txt").write_text("user-owned collision")
        before = self.snapshot()
        result = self.run_installer("--skip-build")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("src/new.txt", result.stderr)
        self.assertEqual(before, self.snapshot())
        self.assertFalse((self.target / ".devuelveloya-backups").exists())

    def test_restore_refuses_to_overwrite_newer_edits_without_partial_writes(self):
        self.assertEqual(self.run_installer("--skip-build").returncode, 0)
        (self.target / "app.txt").write_text("a later edit")
        before = self.snapshot()
        result = self.restore()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("cambios posteriores", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_symlink_parent_and_symlink_file_are_rejected(self):
        outside = self.home / "outside"
        outside.mkdir()
        (self.target / "src").symlink_to(outside, target_is_directory=True)
        result = self.run_installer("--skip-build")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(outside.iterdir()), [])
        self.assertEqual((self.target / "app.txt").read_text(), "original app\n")
        (self.target / "src").unlink()
        (self.target / "app.txt").unlink()
        secret = outside / "external.txt"
        secret.write_text("original app\n")
        (self.target / "app.txt").symlink_to(secret)
        self.assertNotEqual(self.run_installer("--skip-build").returncode, 0)
        self.assertEqual(secret.read_text(), "original app\n")

    def test_symlink_backup_folder_and_marker_are_rejected(self):
        outside = self.home / "outside"
        outside.mkdir()
        (self.target / ".devuelveloya-backups").symlink_to(outside, target_is_directory=True)
        self.assertNotEqual(self.run_installer("--skip-build").returncode, 0)
        self.assertEqual(list(outside.iterdir()), [])
        (self.target / ".devuelveloya-backups").unlink()
        (self.target / "package.json").unlink()
        (self.target / "package.json").symlink_to(self.repo / "package.json")
        self.assertNotEqual(self.run_installer("--check").returncode, 0)

    def test_wrong_project_is_rejected(self):
        (self.target / "artifacts/api-server/package.json").write_text('{"name":"some-other-app"}')
        self.assertNotEqual(self.run_installer("--skip-build").returncode, 0)
        self.assertFalse((self.target / ".devuelveloya-backups").exists())

    def test_protected_and_ignored_files_are_not_packaged(self):
        self.write(".env", "DO_NOT_PACKAGE_THIS_VALUE")
        self.write("nested/secret.key", "PRIVATE_KEY_MARKER")
        self.write("node_modules/dependency.txt", "NODE_MODULES_MARKER")
        self.write("ignored.txt", "IGNORED_MARKER")
        self.write("dist/generated.js", "COMPILED_ARTIFACT_MARKER")
        self.build()
        with zipfile.ZipFile(io.BytesIO(self.payload())) as archive:
            all_data = b"".join(archive.read(name) for name in archive.namelist())
            for marker in [b"DO_NOT_PACKAGE", b"PRIVATE_KEY_MARKER", b"NODE_MODULES_MARKER", b"IGNORED_MARKER", b"COMPILED_ARTIFACT_MARKER"]:
                self.assertNotIn(marker, all_data)
        for name in ["../outside", "/tmp/outside", "nested/../../outside", "files\\outside", ".git/config", ".env", "secret.key", "a//b", "./x"]:
            with self.assertRaises(ValueError, msg=name):
                self.runtime()["safe_name"](name)

    def test_corrupt_payload_and_archive_traversal_rejected(self):
        unpack = self.runtime()["unpack"]
        with self.assertRaisesRegex(ValueError, "SHA256"):
            unpack(base64.b64encode(self.payload()).decode(), "0" * 64)
        for bad_name in ["../outside", "/tmp/outside", "files/../../outside", ".env"]:
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                archive.writestr("manifest.json", '{"version":1,"files":[]}')
                archive.writestr(bad_name, "bad")
            raw = buffer.getvalue()
            with self.assertRaises(ValueError, msg=bad_name):
                unpack(base64.b64encode(raw).decode(), hashlib.sha256(raw).hexdigest())

    def test_archive_symlink_and_hash_mismatch_rejected(self):
        raw = self.payload()
        with zipfile.ZipFile(io.BytesIO(raw)) as original:
            entries = {name: original.read(name) for name in original.namelist()}
        for kind in ["symlink", "corrupt-file"]:
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                for name, data in entries.items():
                    if name == "files/app.txt" and kind == "symlink":
                        info = zipfile.ZipInfo(name)
                        info.create_system = 3
                        info.external_attr = (stat.S_IFLNK | 0o777) << 16
                        archive.writestr(info, data)
                    else:
                        archive.writestr(name, b"corrupted" if name == "files/app.txt" and kind == "corrupt-file" else data)
            corrupted = buffer.getvalue()
            with self.assertRaises(ValueError):
                self.runtime()["unpack"](base64.b64encode(corrupted).decode(), hashlib.sha256(corrupted).hexdigest())

    def test_copy_failure_rolls_back_already_written_files(self):
        ns = self.runtime()
        original_write = ns["atomic_write"]
        calls = []
        def fail_second(root, name, data, mode, expected):
            calls.append(name)
            if len(calls) == 2:
                raise OSError("simulated disk failure")
            return original_write(root, name, data, mode, expected)
        ns["atomic_write"] = fail_second
        current = Path.cwd()
        raw = self.payload()
        try:
            os.chdir(self.target)
            with patch("sys.argv", ["installer", "--skip-build"]), patch("sys.stdout", io.StringIO()), patch("sys.stderr", io.StringIO()):
                with self.assertRaisesRegex(OSError, "simulated"):
                    ns["main"](base64.b64encode(raw).decode(), hashlib.sha256(raw).hexdigest(), BUILDER.RUNTIME)
        finally:
            os.chdir(current)
        self.assertEqual((self.target / "app.txt").read_text(), "original app\n")
        self.assertFalse((self.target / "src/new.txt").exists())
        self.assertEqual(json.loads(self.backups()[0].read_text())["state"], "rolled-back")

    def test_failed_build_reports_failure_and_keeps_restorable_backup(self):
        binary = self.home / "bin"
        binary.mkdir()
        pnpm = binary / "pnpm"
        pnpm.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$PNPM_CALLS"\nif [ "$1" = "run" ]; then exit 27; fi\n')
        pnpm.chmod(0o755)
        calls = self.home / "calls.txt"
        env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"], "PNPM_CALLS": str(calls)}
        result = self.run_installer(env=env)
        self.assertEqual(result.returncode, 27, result.stderr)
        self.assertIn("NO está terminada", result.stderr)
        self.assertEqual(calls.read_text().splitlines(), ["install --frozen-lockfile", "run build:dvy"])
        self.assertEqual(json.loads(self.backups()[0].read_text())["state"], "build-failed")
        self.assertEqual(self.restore().returncode, 0)

    def test_drifted_lock_dry_run_is_read_only_and_does_not_resolve(self):
        self.drift_lock()
        env, calls, _ = self.reconciliation_stub()
        before = self.snapshot()
        result = self.run_installer("--check", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.read_calls(calls), [])
        self.assertFalse((self.target / ".devuelveloya-backups").exists())

    def test_drifted_lock_resolves_in_stage_and_restores_exact_original(self):
        original = self.drift_lock()
        env, calls, candidate = self.reconciliation_stub()
        result = self.run_installer(env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        recorded = self.read_calls(calls)
        self.assertEqual([item["phase"] for item in recorded], ["resolve", "install", "build"])
        self.assertEqual(recorded[0]["lock"], original)
        self.assertEqual(recorded[1]["lock"], candidate)
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), candidate)
        self.assertEqual((self.target / "app.txt").read_text(), "improved app\n")
        record = json.loads(self.backups()[0].read_text())
        lock = next(item for item in record["files"] if item["path"] == "pnpm-lock.yaml")
        self.assertEqual(lock["before_sha256"], hashlib.sha256(original.encode()).hexdigest())
        self.assertEqual(lock["after_sha256"], hashlib.sha256(candidate.encode()).hexdigest())
        self.assertEqual(self.restore().returncode, 0)
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), original)
        self.assertEqual((self.target / "app.txt").read_text(), "original app\n")

    def test_drifted_lock_resolution_failure_leaves_every_project_file_untouched(self):
        self.drift_lock()
        env, calls, _ = self.reconciliation_stub(fail_phase="resolve")
        before = self.snapshot()
        root_entries = sorted(path.name for path in self.target.iterdir())
        result = self.run_installer(env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([item["phase"] for item in self.read_calls(calls)], ["resolve"])
        self.assertEqual(before, self.snapshot())
        self.assertEqual(root_entries, sorted(path.name for path in self.target.iterdir()))
        self.assertFalse((self.target / ".devuelveloya-backups").exists())

    def test_drifted_lock_failed_install_remains_restorable(self):
        original = self.drift_lock()
        env, calls, candidate = self.reconciliation_stub(fail_phase="install")
        result = self.run_installer(env=env)
        self.assertEqual(result.returncode, 37, result.stderr)
        self.assertEqual([item["phase"] for item in self.read_calls(calls)], ["resolve", "install"])
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), candidate)
        self.assertEqual(self.restore().returncode, 0)
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), original)
        self.assertEqual((self.target / "app.txt").read_text(), "original app\n")

    def test_drifted_lock_failed_build_remains_restorable(self):
        original = self.drift_lock()
        env, calls, candidate = self.reconciliation_stub(fail_phase="build")
        result = self.run_installer(env=env)
        self.assertEqual(result.returncode, 37, result.stderr)
        self.assertEqual([item["phase"] for item in self.read_calls(calls)], ["resolve", "install", "build"])
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), candidate)
        self.assertEqual(self.restore().returncode, 0)
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), original)

    def test_drifted_lock_requires_reconciliation_even_when_skip_build_requested(self):
        self.drift_lock()
        env, calls, _ = self.reconciliation_stub()
        before = self.snapshot()
        result = self.run_installer("--skip-build", env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--skip-build", result.stderr)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.read_calls(calls), [])

    def test_drifted_lock_detects_changes_to_unmodified_dependency_manifest(self):
        self.drift_lock()
        descriptor = self.target / "artifacts/api-server/package.json"
        descriptor.write_text('{"name":"api","dependencies":{"user-library":"1.0.0"}}\n')
        env, calls, _ = self.reconciliation_stub()
        before = self.snapshot()
        result = self.run_installer(env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("artifacts/api-server/package.json", result.stderr)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.read_calls(calls), [])

    def test_drifted_lock_does_not_hide_source_conflicts(self):
        self.drift_lock()
        (self.target / "app.txt").write_text("user source changes\n")
        env, calls, _ = self.reconciliation_stub()
        before = self.snapshot()
        result = self.run_installer(env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("app.txt", result.stderr)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.read_calls(calls), [])

    def test_drifted_lock_symlink_is_rejected_before_resolution(self):
        outside = self.home / "outside-lock.yaml"
        outside.write_text("lockfileVersion: '9.0'\n# outside project\n")
        (self.target / "pnpm-lock.yaml").unlink()
        (self.target / "pnpm-lock.yaml").symlink_to(outside)
        env, calls, _ = self.reconciliation_stub()
        result = self.run_installer(env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.read_calls(calls), [])
        self.assertEqual(outside.read_text(), "lockfileVersion: '9.0'\n# outside project\n")
        self.assertEqual((self.target / "app.txt").read_text(), "original app\n")

    def test_reconciled_lock_later_edit_blocks_restore_without_partial_writes(self):
        self.drift_lock()
        env, _, _ = self.reconciliation_stub()
        self.assertEqual(self.run_installer(env=env).returncode, 0)
        (self.target / "pnpm-lock.yaml").write_text("later user resolutions\n")
        before = self.snapshot()
        result = self.restore()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("pnpm-lock.yaml", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_reconciled_lock_reapply_creates_no_duplicate_backup(self):
        self.drift_lock()
        env, calls, candidate = self.reconciliation_stub()
        self.assertEqual(self.run_installer(env=env).returncode, 0)
        before = self.snapshot()
        result = self.run_installer(env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), candidate)
        self.assertEqual(len(self.backups()), 1)
        self.assertEqual(before, self.snapshot())

    def test_already_applied_code_with_new_lock_drift_gets_lock_only_backup(self):
        self.drift_lock()
        env, _, candidate = self.reconciliation_stub()
        self.assertEqual(self.run_installer(env=env).returncode, 0)
        later_lock = "lockfileVersion: '9.0'\n# later user lock updates\n"
        (self.target / "pnpm-lock.yaml").write_text(later_lock)
        result = self.run_installer(env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        records = [(path, json.loads(path.read_text())) for path in self.backups()]
        self.assertEqual(len(records), 2)
        path, record = next((path, record) for path, record in records if len(record["files"]) == 1)
        self.assertEqual(record["files"][0]["path"], "pnpm-lock.yaml")
        restored = subprocess.run([sys.executable, str(path.parent / "restaurar.py")], cwd=self.target, capture_output=True, text=True)
        self.assertEqual(restored.returncode, 0, restored.stderr)
        self.assertEqual((self.target / "pnpm-lock.yaml").read_text(), later_lock)
        self.assertEqual((self.target / "app.txt").read_text(), "improved app\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
