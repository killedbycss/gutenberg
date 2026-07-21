"""Prepare an architecture-local Python environment and launch Gutenberg API."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    support = Path(sys.argv[1])
    root = Path(sys.argv[2])
    runtime = support / "python-runtime"
    python = runtime / "bin" / "python"
    requirements = root / "studio" / "backend" / "requirements.txt"
    server = root / "studio" / "backend" / "app.py"

    support.mkdir(parents=True, exist_ok=True)
    if not python.exists():
        subprocess.check_call([sys.executable, "-m", "venv", str(runtime)])

    check = subprocess.run(
        [str(python), "-c", "import flask, flask_cors, requests, fontTools, brotli, PIL"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if check.returncode:
        subprocess.check_call([
            str(python), "-m", "pip", "install",
            "--disable-pip-version-check", "--timeout", "120", "--retries", "5",
            "-r", str(requirements),
        ])

    environment = os.environ.copy()
    os.execve(str(python), [str(python), str(server)], environment)


if __name__ == "__main__":
    main()
