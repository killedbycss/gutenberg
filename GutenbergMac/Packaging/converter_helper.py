"""Offline converter entry point bundled inside Gutenberg.app."""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

import fontkit
import imagekit


def analyze(data: bytes) -> dict:
    if data[:4] in (b"wOFF", b"wOF2", b"OTTO", b"true", b"typ1", b"ttcf", b"\x00\x01\x00\x00"):
        result = fontkit.analyze_font(data, fontkit.DEFAULT_PRESET)
        result["kind"] = "font"
        return result
    result = imagekit.analyze_image(data)
    result["kind"] = "image"
    return result


def convert(output: Path, targets: list[str], inputs: list[Path]) -> None:
    manifest = {"targets": targets, "items": []}
    outputs_ok = 0
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in inputs:
            data = path.read_bytes()
            report = analyze(data)
            item = {"filename": path.name, "source": report, "outputs": [], "errors": []}
            if report.get("ok"):
                for target in targets:
                    try:
                        result = imagekit.convert_image(data, target) if report["kind"] == "image" else fontkit.convert_font(data, target)
                    except Exception as exc:
                        result = {"ok": False, "error": str(exc)}
                    if result.get("ok"):
                        name = f"{path.stem}.{result['ext']}"
                        archive_name = f"{path.stem}/{name}" if len(inputs) > 1 else name
                        archive.writestr(archive_name, result["data"])
                        item["outputs"].append({"format": target, "filename": name, "size": len(result["data"]), "warnings": result.get("warnings", [])})
                        outputs_ok += 1
                    elif target in ("otf", "ttf", "woff", "woff2", "png", "jpg", "webp"):
                        item["errors"].append({"format": target, "error": result.get("error", "Ошибка конвертации")})
            else:
                item["errors"].append({"error": report.get("error", "Файл не читается")})
            manifest["items"].append(item)
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    if outputs_ok == 0:
        output.unlink(missing_ok=True)
        raise RuntimeError("Ни один файл не удалось сконвертировать")


if __name__ == "__main__":
    try:
        command, output, targets, *files = sys.argv[1:]
        if command == "preview-font":
            source = Path(targets).read_bytes()
            result = fontkit.convert_font(source, "ttf")
            if not result.get("ok"):
                raise RuntimeError(result.get("error", "Шрифт не читается"))
            Path(output).write_bytes(result["data"])
        elif command == "convert":
            convert(Path(output), targets.split(","), [Path(item) for item in files])
        else:
            raise RuntimeError("Неизвестная команда")
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
