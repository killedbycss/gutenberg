"""Локальная конвертация видео и GIF через поставляемый с Python FFmpeg."""

from __future__ import annotations

import os
import re
import subprocess
import tempfile

import imageio_ffmpeg


TARGET_FORMATS = [
    {"key": "mp4", "label": "MP4", "ext": "mp4", "kind": "media", "note": "H.264 — универсальный формат"},
    {"key": "mov", "label": "MOV", "ext": "mov", "kind": "media", "note": "QuickTime для macOS и монтажа"},
    {"key": "webm-video", "label": "WebM", "ext": "webm", "kind": "media", "note": "VP9 для веба"},
    {"key": "gif-video", "label": "GIF", "ext": "gif", "kind": "media", "note": "Зацикленная GIF-анимация"},
]


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-y", *args],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def analyze_media(data: bytes, filename: str = "media") -> dict:
    suffix = os.path.splitext(filename)[1] or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix) as source:
        source.write(data); source.flush()
        result = _run(["-i", source.name, "-f", "null", "-"])
    log = result.stderr.decode("utf-8", "replace")
    duration = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", log)
    size = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", log)
    if "Video:" not in log:
        return {"ok": False, "kind": "media", "error": "FFmpeg не распознал видео или GIF"}
    seconds = (int(duration.group(1)) * 3600 + int(duration.group(2)) * 60 + float(duration.group(3))) if duration else None
    return {"ok": True, "kind": "media", "source": {"key": suffix.lstrip(".").lower(), "label": suffix.lstrip(".").upper()},
            "media": {"width": int(size.group(1)) if size else None, "height": int(size.group(2)) if size else None,
                      "duration": seconds}}


def convert_media(data: bytes, filename: str, target: str, options: dict | None = None) -> dict:
    suffix = os.path.splitext(filename)[1] or ".bin"
    out_ext = {"mp4": "mp4", "mov": "mov", "webm-video": "webm", "gif-video": "gif"}.get(target)
    if not out_ext:
        return {"ok": False, "error": f"Неизвестный формат медиа: {target}", "warnings": []}
    options = options or {}
    quality = max(1, min(100, int(options.get("quality", 82))))
    crf = str(round(36 - quality * .24))
    width, height = options.get("width"), options.get("height")
    scale = []
    if width or height:
        scale = ["-vf", f"scale={width or -2}:{height or -2}:force_original_aspect_ratio=decrease"]
    with tempfile.TemporaryDirectory() as directory:
        source = os.path.join(directory, f"source{suffix}")
        output = os.path.join(directory, f"result.{out_ext}")
        with open(source, "wb") as stream:
            stream.write(data)
        if target == "mp4":
            args = ["-i", source, *scale, "-c:v", "libx264", "-crf", crf, "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output]
        elif target == "mov":
            args = ["-i", source, *scale, "-c:v", "libx264", "-crf", crf, "-pix_fmt", "yuv420p", "-c:a", "aac", output]
        elif target == "webm-video":
            args = ["-i", source, *scale, "-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0", "-c:a", "libopus", output]
        else:
            gif_width = width or 960
            args = ["-i", source, "-vf", f"fps=12,scale='min({gif_width},iw)':-1:flags=lanczos", "-loop", "0", output]
        result = _run(args)
        if result.returncode or not os.path.exists(output):
            message = result.stderr.decode("utf-8", "replace").strip().splitlines()[-1:]
            return {"ok": False, "error": message[0] if message else "Ошибка FFmpeg", "warnings": []}
        with open(output, "rb") as stream:
            payload = stream.read()
    return {"ok": True, "data": payload, "ext": out_ext, "outline": None, "warnings": []}
