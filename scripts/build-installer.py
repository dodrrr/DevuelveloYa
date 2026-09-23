#!/usr/bin/env python3
"""Package the current Git changes as one offline, reversible Replit installer."""

import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
import zipfile


# This exact program is embedded in both the installer and its restore helper.
RUNTIME = r'''
import argparse
import base64
import datetime
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid
import zipfile

BACKUPS = ".devuelveloya-backups"
LOCKFILE = "pnpm-lock.yaml"
BLOCKED_PARTS = {".git", ".ssh", ".aws", ".config", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache", "coverage", "test-results", "playwright-report", BACKUPS}
BLOCKED_NAMES = {"credentials", "credentials.json", "secrets", "secrets.json", "id_rsa", "id_ed25519", ".npmrc", ".netrc", ".pypirc"}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def safe_name(name):
    if not isinstance(name, str) or not name or "\\" in name or "\x00" in name:
        raise ValueError("Ruta de archivo no válida")
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name or any(p in {"", ".", ".."} for p in name.split("/")):
        raise ValueError("Ruta fuera del proyecto: " + name)
    for part in path.parts:
        lower = part.lower()
        if lower in BLOCKED_PARTS or lower in BLOCKED_NAMES or lower.startswith(".env") or lower.endswith((".pem", ".key", ".p12", ".pfx", ".keystore")):
            raise ValueError("Archivo protegido: " + name)
    return name

def guarded(root, name, allow_missing=True):
    """Reject links and non-directory parents before any read or mutation."""
    safe_name(name)
    target = root
    parts = PurePosixPath(name).parts
    for index, part in enumerate(parts):
        target = target / part
        try:
            st = target.lstat()
        except FileNotFoundError:
            if not allow_missing:
                raise ValueError("Falta el archivo: " + name)
            continue
        if stat.S_ISLNK(st.st_mode):
            raise ValueError("Enlace simbólico no permitido: " + name)
        if index < len(parts) - 1 and not stat.S_ISDIR(st.st_mode):
            raise ValueError("Un directorio es un archivo: " + name)
        if index == len(parts) - 1 and not stat.S_ISREG(st.st_mode):
            raise ValueError("El destino no es un archivo normal: " + name)
    return root / name

def file_state(root, name):
    path = guarded(root, name)
    if not path.exists():
        return None, None
    return digest(path.read_bytes()), stat.S_IMODE(path.stat().st_mode)

def read_marker(root, name):
    path = guarded(root, name, allow_missing=False)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        raise ValueError("No es el proyecto esperado: " + name)

def validate_root(root, markers):
    guarded(root, "pnpm-workspace.yaml", allow_missing=False)
    for marker in markers:
        value = read_marker(root, marker["path"])
        if not isinstance(value, dict) or value.get("name") not in marker["names"]:
            raise ValueError("Este instalador no corresponde al proyecto: " + marker["path"])

def unpack(encoded, expected):
    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception:
        raise ValueError("El instalador está incompleto: base64 no válido")
    if digest(raw) != expected:
        raise ValueError("El instalador está dañado: SHA256 incorrecto")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = archive.infolist()
        names = [entry.filename for entry in infos]
        if len(names) != len(set(names)) or "manifest.json" not in names:
            raise ValueError("Paquete con entradas duplicadas o sin manifiesto")
        if len(infos) > 10000 or sum(i.file_size for i in infos) > 150_000_000:
            raise ValueError("Paquete demasiado grande")
        for entry in infos:
            safe_name(entry.filename)
            file_type = stat.S_IFMT(entry.external_attr >> 16)
            if entry.is_dir() or file_type not in {0, stat.S_IFREG} or entry.flag_bits & 1:
                raise ValueError("Entrada de paquete no permitida: " + entry.filename)
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("version") != 1 or not isinstance(manifest.get("files"), list):
            raise ValueError("Formato de manifiesto no reconocido")
        paths = [safe_name(entry["path"]) for entry in manifest["files"]]
        if len(paths) != len(set(paths)) or set(names) != {"manifest.json", *("files/" + name for name in paths)}:
            raise ValueError("El paquete no coincide con su manifiesto")
        data = {}
        for entry in manifest["files"]:
            name = entry["path"]
            content = archive.read("files/" + name)
            if digest(content) != entry["after_sha256"] or entry["after_mode"] not in {0o644, 0o755}:
                raise ValueError("Archivo dañado en el paquete: " + name)
            before = entry["before_sha256"]
            if before is not None and (not isinstance(before, str) or len(before) != 64 or any(c not in "0123456789abcdef" for c in before)):
                raise ValueError("Huella original no válida: " + name)
            data[name] = content
        return manifest, data

def mkdir_parents(root, name, created):
    guarded(root, name)
    current = root
    for part in PurePosixPath(name).parts[:-1]:
        current = current / part
        if not current.exists():
            current.mkdir(mode=0o755)
            created.append(current.relative_to(root).as_posix())
        if current.is_symlink() or not current.is_dir():
            raise ValueError("Directorio de destino inseguro: " + str(current))

def atomic_write(root, name, data, mode, expected):
    path = guarded(root, name)
    if file_state(root, name)[0] != expected:
        raise ValueError("El archivo cambió durante la operación: " + name)
    fd, temporary = tempfile.mkstemp(prefix=".dvy-write-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
        guarded(root, name)
        if file_state(root, name)[0] != expected:
            raise ValueError("El archivo cambió durante la operación: " + name)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def backup_container(root):
    base = root / BACKUPS
    if base.is_symlink() or (base.exists() and not base.is_dir()):
        raise ValueError("La carpeta de copias de seguridad no es segura")
    return base

def save_record(backup, record):
    path = backup / "manifest.json"
    if path.is_symlink():
        raise ValueError("Manifiesto de copia inseguro")
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def make_backup(root, changes, created, runtime):
    base = backup_container(root)
    base.mkdir(exist_ok=True, mode=0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = base / (stamp + "-" + uuid.uuid4().hex[:8])
    backup.mkdir(mode=0o700)
    (backup / "files").mkdir(mode=0o700)
    record = {"version": 1, "root": str(root), "state": "prepared", "files": [], "created_dirs": created}
    for entry in changes:
        item = dict(entry)
        before, mode = file_state(root, item["path"])
        if before != item["before_sha256"]:
            raise ValueError("El proyecto cambió antes de guardar la copia: " + item["path"])
        item["before_mode"] = mode
        if before is not None:
            data = guarded(root, item["path"]).read_bytes()
            if digest(data) != before:
                raise ValueError("El proyecto cambió durante la copia: " + item["path"])
            destination = backup / "files" / item["path"]
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            destination.write_bytes(data)
        record["files"].append(item)
    save_record(backup, record)
    (backup / "restaurar.py").write_text("#!/usr/bin/env python3\n" + runtime + "\nif __name__ == '__main__':\n    try:\n        restore_main(Path(__file__).resolve().parent)\n    except (ValueError, OSError, KeyError, TypeError) as exc:\n        print('ERROR: ' + str(exc), file=sys.stderr)\n        sys.exit(1)\n", encoding="utf-8")
    return backup, record

def restore_record(backup, record, only=None):
    root = Path(record["root"])
    if not root.is_absolute() or root.is_symlink() or root.resolve() != root:
        raise ValueError("La raíz de restauración no es segura")
    base = backup_container(root)
    if backup.parent != base or backup.is_symlink() or (backup / "files").is_symlink():
        raise ValueError("La copia no está en su carpeta original")
    entries = record["files"]
    if not isinstance(entries, list):
        raise ValueError("Manifiesto de copia no válido")
    names = [safe_name(item["path"]) for item in entries]
    if len(names) != len(set(names)):
        raise ValueError("Manifiesto de copia con duplicados")
    selected, contents = [], {}
    for entry in entries:
        name = entry["path"]
        if only is not None and name not in only:
            continue
        before, after = entry["before_sha256"], entry["after_sha256"]
        current, _ = file_state(root, name)
        if current not in {before, after}:
            raise ValueError("Restauración cancelada: hay cambios posteriores en " + name)
        if before is not None:
            source = guarded(backup / "files", name, allow_missing=False)
            contents[name] = source.read_bytes()
            if digest(contents[name]) != before:
                raise ValueError("Copia dañada: " + name)
            if not isinstance(entry["before_mode"], int) or not 0 <= entry["before_mode"] <= 0o777:
                raise ValueError("Permisos de copia no válidos")
        if current != before:
            selected.append(entry)
    # All conflicts and backup checksums are checked before changing any file.
    for entry in reversed(selected):
        name = entry["path"]
        if entry["before_sha256"] is None:
            path = guarded(root, name)
            if file_state(root, name)[0] != entry["after_sha256"]:
                raise ValueError("El archivo cambió durante la restauración: " + name)
            path.unlink()
        else:
            atomic_write(root, name, contents[name], entry["before_mode"], entry["after_sha256"])
    for name in reversed(record.get("created_dirs", [])):
        safe_name(name)
        # Guard every parent using an absent placeholder; never follow a link.
        guarded(root, name + "/.dvy-directory-check")
        path = root / name
        if path.exists():
            try:
                path.rmdir()
            except OSError:
                pass  # Keep directories that now contain somebody else's files.
    return len(selected)

def restore_main(backup):
    if len(sys.argv) != 1:
        raise ValueError("Uso: python3 ruta/de/la/copia/restaurar.py")
    if (backup / "manifest.json").is_symlink():
        raise ValueError("Manifiesto inseguro")
    record = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
    if record.get("version") != 1:
        raise ValueError("Copia no reconocida")
    changed = restore_record(backup, record)
    record["state"] = "restored"
    save_record(backup, record)
    print(f"Restauración terminada: {changed} archivos. La copia se conserva.")
    print("Ejecuta pnpm install --frozen-lockfile y reinicia Run para usar la versión restaurada.")

def dependency_sources(root, manifest, data):
    """Validate every workspace manifest, including unchanged packages, read-only."""
    descriptors = manifest.get("dependency_manifests")
    if not isinstance(descriptors, list) or not descriptors:
        raise ValueError("Este paquete no puede adaptar el lockfile. Envía pnpm-lock.yaml para preparar una actualización compatible.")
    sources = {}
    for descriptor in descriptors:
        name = safe_name(descriptor["path"])
        if name not in {"package.json", "pnpm-workspace.yaml"} and not name.endswith("/package.json"):
            raise ValueError("Descriptor de dependencias no válido: " + name)
        current, _ = file_state(root, name)
        if current not in {descriptor["before_sha256"], descriptor["after_sha256"]}:
            raise ValueError("No se ha cambiado la app: también hay cambios de dependencias en " + name)
        content = data.get(name)
        if content is None:
            content = guarded(root, name, allow_missing=False).read_bytes()
        if digest(content) != descriptor["after_sha256"]:
            raise ValueError("El manifiesto de dependencias cambió: " + name)
        sources[name] = content
    return sources

def reconcile_lock(root, manifest, data, expected_hash):
    """Resolve in an isolated workspace; learn the final hash before any app write."""
    sources = dependency_sources(root, manifest, data)
    original = guarded(root, LOCKFILE, allow_missing=False).read_bytes()
    if digest(original) != expected_hash:
        raise ValueError("El lockfile cambió durante la preparación. Vuelve a ejecutar el instalador.")
    if len(original) > 16_000_000:
        raise ValueError("Lockfile demasiado grande para la adaptación automática.")
    print("Preparando dependencias en una carpeta temporal; tu lockfile original se conserva.", flush=True)
    with tempfile.TemporaryDirectory(prefix=".dvy-preparacion-", dir=root) as temporary:
        stage = Path(temporary)
        for name, content in sources.items():
            destination = stage / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        (stage / LOCKFILE).write_bytes(original)
        command = ["pnpm", "install", "--lockfile-only", "--no-frozen-lockfile", "--ignore-scripts"]
        result = subprocess.run(command, cwd=stage)
        if result.returncode:
            raise ValueError("No se ha cambiado la app: pnpm no pudo preparar las dependencias. Revisa el error anterior y vuelve a ejecutar el instalador.")
        for name, content in sources.items():
            if guarded(stage, name, allow_missing=False).read_bytes() != content:
                raise ValueError("No se ha cambiado la app: pnpm modificó un manifiesto durante la preparación.")
        candidate = guarded(stage, LOCKFILE, allow_missing=False).read_bytes()
        if not candidate or len(candidate) > 16_000_000:
            raise ValueError("No se ha cambiado la app: lockfile preparado no válido.")
    if file_state(root, LOCKFILE)[0] != expected_hash:
        raise ValueError("El lockfile cambió durante la preparación. Vuelve a ejecutar el instalador.")
    dependency_sources(root, manifest, data)
    return candidate

def main(encoded, expected, runtime):
    parser = argparse.ArgumentParser(description="Actualiza DevuélveloYa desde la raíz de tu proyecto Replit.")
    parser.add_argument("--check", action="store_true", help="Verificar sin cambiar archivos ni instalar dependencias")
    parser.add_argument("--skip-build", action="store_true", help="Aplicar los archivos sin instalar ni compilar (solo pruebas)")
    args = parser.parse_args()
    root = Path.cwd().resolve()
    manifest, data = unpack(encoded, expected)
    validate_root(root, manifest["markers"])
    backup_container(root)
    changes, conflicts = [], []
    lock_drift = None
    for entry in manifest["files"]:
        current, mode = file_state(root, entry["path"])
        if current == entry["after_sha256"]:
            continue
        if current != entry["before_sha256"] and entry["path"] == LOCKFILE and current is not None and manifest.get("dependency_manifests"):
            lock_drift = {**entry, "before_sha256": current, "after_mode": mode}
        elif current != entry["before_sha256"]:
            conflicts.append(entry["path"])
        else:
            changes.append(entry)
    if conflicts:
        raise ValueError("No se ha cambiado ningún archivo. Tu proyecto tiene cambios que este paquete no conoce:\n  " + "\n  ".join(conflicts) + "\nEnvía esos archivos para preparar una actualización compatible.")
    if lock_drift:
        dependency_sources(root, manifest, data)
    print(f"Verificación correcta: {len(changes)} archivos por actualizar; {len(manifest['files']) - len(changes) - bool(lock_drift)} ya coinciden.")
    if lock_drift:
        print("Tu pnpm-lock.yaml es diferente: se adaptará desde tu versión, sin sustituirlo a ciegas.")
    if args.check:
        print("Comprobación terminada. No se ha escrito ningún archivo.")
        return 0
    if lock_drift and args.skip_build:
        raise ValueError("La adaptación del lockfile necesita pnpm. Ejecuta el instalador sin --skip-build; todavía no se ha cambiado la app.")
    if not args.skip_build and shutil.which("pnpm") is None:
        raise ValueError("Falta pnpm en Shell. No se ha modificado la app; usa el entorno Node.js/pnpm de tu proyecto Replit.")
    if lock_drift:
        candidate = reconcile_lock(root, manifest, data, lock_drift["before_sha256"])
        lock_drift["after_sha256"] = digest(candidate)
        data[LOCKFILE] = candidate
        if lock_drift["after_sha256"] != lock_drift["before_sha256"]:
            changes.append(lock_drift)
    backup = None
    if changes:
        created, written = [], set()
        backup, record = make_backup(root, changes, created, runtime)
        print("Copia de seguridad: " + str(backup.relative_to(root)), flush=True)
        try:
            for entry in changes:
                mkdir_parents(root, entry["path"], created)
                save_record(backup, record)
                atomic_write(root, entry["path"], data[entry["path"]], entry["after_mode"], entry["before_sha256"])
                written.add(entry["path"])
            record["state"] = "applied"
            save_record(backup, record)
        except BaseException:
            try:
                restore_record(backup, record, only=written)
                record["state"] = "rolled-back"
                save_record(backup, record)
                print("Falló la escritura: se han restaurado los archivos modificados.", file=sys.stderr)
            except Exception as rollback_error:
                print("No se pudo terminar la restauración automática: " + str(rollback_error), file=sys.stderr)
            print("La copia se conserva en " + str(backup), file=sys.stderr)
            raise
    else:
        print("Los archivos de esta actualización ya están aplicados.")
    if args.skip_build:
        print("Archivos aplicados. Instalación y compilación omitidas (--skip-build); no se ha verificado el arranque.")
        return 0
    commands = [["pnpm", "install", "--frozen-lockfile"], ["pnpm", "run", "build:dvy"]]
    for command in commands:
        print("Ejecutando: " + " ".join(command), flush=True)
        result = subprocess.run(command, cwd=root)
        if result.returncode:
            if backup:
                record["state"] = "build-failed"
                record["failed_command"] = command
                save_record(backup, record)
            print("La actualización NO está terminada: falló " + " ".join(command) + ".", file=sys.stderr)
            print("Los archivos se conservan. Revisa el error y vuelve a ejecutar este instalador.", file=sys.stderr)
            if backup:
                print("Para restaurar: python3 " + str(backup.relative_to(root) / "restaurar.py"), file=sys.stderr)
            return result.returncode if result.returncode > 0 else 1
    if backup:
        record["state"] = "complete"
        save_record(backup, record)
    print("Actualización y compilación completadas. Detén y vuelve a pulsar Run en Replit.")
    if backup:
        print("Para restaurar: python3 " + str(backup.relative_to(root) / "restaurar.py"))
    return 0
'''


def git(root, *arguments):
    return subprocess.check_output(["git", "-C", str(root), *arguments])


def build(root, output):
    # Reuse the runtime's path rules so a package cannot contain something its
    # installer would reject. No files excluded here are opened or packaged.
    shared = {}
    exec(RUNTIME, shared)
    safe_name, digest, guarded = (shared[name] for name in ("safe_name", "digest", "guarded"))
    root = root.resolve()
    if Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() != root:
        raise ValueError("--repo debe ser la raíz del repositorio")
    changed = git(root, "diff", "--name-only", "--no-renames", "-z", "HEAD").decode().split("\0")
    added = git(root, "ls-files", "--others", "--exclude-standard", "-z").decode().split("\0")
    files, contents = [], {}
    skipped = []
    for name in sorted(set(changed + added) - {""}):
        try:
            safe_name(name)
        except ValueError:
            skipped.append(name)
            continue
        parts = PurePosixPath(name).parts
        if any(part in {"dist", "build", ".cache", ".turbo", "output", "deliverables"} for part in parts) or name.endswith((".log", ".tsbuildinfo", ".pyc", ".zip", ".tar", ".gz")) or root / name == output.resolve():
            skipped.append(name)
            continue
        ignored = subprocess.run(["git", "-C", str(root), "check-ignore", "--no-index", "--quiet", name])
        if ignored.returncode == 0:
            skipped.append(name)
            continue
        if ignored.returncode != 1:
            raise ValueError("No se pudo verificar .gitignore para " + name)
        path = guarded(root, name)
        if not path.exists():
            raise ValueError("Este instalador no elimina archivos; restaura o gestiona por separado: " + name)
        previous = subprocess.run(["git", "-C", str(root), "cat-file", "-e", "HEAD:" + name], capture_output=True)
        before = git(root, "show", "HEAD:" + name) if previous.returncode == 0 else None
        data = path.read_bytes()
        mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
        if before is not None and digest(before) == digest(data):
            continue
        files.append({"path": name, "before_sha256": digest(before) if before is not None else None, "after_sha256": digest(data), "after_mode": mode})
        contents[name] = data
    if not files:
        raise ValueError("No hay cambios que empaquetar respecto de HEAD")
    markers = []
    for name in ("package.json", "artifacts/api-server/package.json", "artifacts/mockup-sandbox/package.json"):
        current = json.loads(guarded(root, name, allow_missing=False).read_text(encoding="utf-8"))
        original = json.loads(git(root, "show", "HEAD:" + name))
        names = sorted({current["name"], original["name"]})
        markers.append({"path": name, "names": names})
    guarded(root, "pnpm-workspace.yaml", allow_missing=False)
    dependency_manifests = []
    candidates = set(git(root, "ls-files", "-z").decode().split("\0") + added)
    for name in sorted(candidates - {""}):
        if name not in {"package.json", "pnpm-workspace.yaml"} and not name.endswith("/package.json"):
            continue
        try:
            safe_name(name)
        except ValueError:
            continue
        if subprocess.run(["git", "-C", str(root), "check-ignore", "--no-index", "--quiet", name]).returncode == 0:
            continue
        content = guarded(root, name, allow_missing=False).read_bytes()
        previous = subprocess.run(["git", "-C", str(root), "show", "HEAD:" + name], capture_output=True)
        dependency_manifests.append({"path": name, "before_sha256": digest(previous.stdout) if previous.returncode == 0 else None, "after_sha256": digest(content)})
    manifest = {"version": 1, "base_commit": git(root, "rev-parse", "HEAD").decode().strip(), "markers": markers, "files": files, "dependency_manifests": dependency_manifests}
    archive_data = io.BytesIO()
    with zipfile.ZipFile(archive_data, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True))
        for name, data in contents.items():
            archive.writestr("files/" + name, data)
    raw = archive_data.getvalue()
    header = "#!/usr/bin/env bash\n# Actualización autocontenida de DevuélveloYa; no descarga código remoto.\nset -eu\nif ! command -v python3 >/dev/null 2>&1; then\n  echo 'Falta Python 3. Ejecuta este archivo desde Shell de tu proyecto Replit.' >&2\n  exit 1\nfi\npython3 - \"$@\" <<'__DVY_PYTHON__'\n"
    footer = "\nRUNTIME_SOURCE = " + repr(RUNTIME) + "\nPAYLOAD = " + repr(base64.b64encode(raw).decode()) + "\nPAYLOAD_SHA256 = " + repr(digest(raw)) + "\ntry:\n    sys.exit(main(PAYLOAD, PAYLOAD_SHA256, RUNTIME_SOURCE))\nexcept (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile) as exc:\n    print('ERROR: ' + str(exc), file=sys.stderr)\n    sys.exit(1)\n__DVY_PYTHON__\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(header + RUNTIME + footer, encoding="utf-8")
    output.chmod(0o755)
    print(f"Creado: {output}\nArchivos: {len(files)}\nBase: {manifest['base_commit']}\nTamaño: {output.stat().st_size} bytes")
    if skipped:
        print("Excluidos por protección/artefactos: " + ", ".join(skipped))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        build(args.repo, args.output)
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        sys.exit(1)
