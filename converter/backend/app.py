"""Flask API конвертера шрифтов.

Эндпоинты
---------
GET  /api/health   — живость сервиса + доступность WOFF2 (brotli).
GET  /api/formats  — метаданные целевых форматов и пресетов набора символов
                     (для чекбоксов на фронте).
POST /api/analyze  — принять один или несколько файлов (multipart, поле `fonts`),
                     вернуть по каждому отчёт: формат, метаданные, метрики,
                     покрытие набора символов и список недостающих глифов.
POST /api/convert  — принять файлы (`fonts`) и список целевых форматов
                     (`targets`), вернуть ZIP со сконвертированными файлами и
                     manifest.json. Сводка результата дублируется в заголовке
                     `X-Summary` (base64(JSON)) — фронт показывает её сразу,
                     не распаковывая архив.

Обработка синхронная. CORS включён для локального фронта на Vite.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import zipfile
from datetime import datetime, timezone

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

import fontkit
import imagekit
from config import Config

app = Flask(__name__)
app.config.from_object(Config)
app.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH
CORS(app, expose_headers=["X-Summary"])

_TARGET_FORMATS = [
    *[{**f, "kind": "font"} for f in fontkit.TARGET_FORMATS],
    *imagekit.TARGET_FORMATS,
]
_TARGETS_BY_KEY = {f["key"]: f for f in _TARGET_FORMATS}
_VALID_TARGETS = set(_TARGETS_BY_KEY)


def _analyze_data(data: bytes, preset: str) -> dict:
    # Сигнатуры sfnt позволяют не пытаться открывать шрифты через Pillow.
    if data[:4] in (b"wOFF", b"wOF2", b"OTTO", b"true", b"typ1", b"ttcf", b"\x00\x01\x00\x00"):
        report = fontkit.analyze_font(data, preset)
        report["kind"] = "font"
        return report
    return imagekit.analyze_image(data)


# --- Вспомогательное -------------------------------------------------------

def _safe_base(filename: str | None) -> str:
    """Базовое имя файла без расширения, без разделителей путей и управляющих
    символов. Юникод (кириллица) сохраняется."""
    name = os.path.basename(filename or "font")
    base = os.path.splitext(name)[0].strip()
    base = re.sub(r"[\\/\x00-\x1f]", "", base)
    return base or "font"


def _parse_targets(req) -> list[str]:
    """Список целевых форматов из формы: поддержаны повторяющиеся поля и
    одно поле со значениями через запятую."""
    raw = req.form.getlist("targets")
    if len(raw) == 1 and "," in raw[0]:
        raw = raw[0].split(",")
    seen, out = set(), []
    for key in (t.strip().lower() for t in raw):
        if key in _VALID_TARGETS and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def _preset(req) -> str:
    value = (req.values.get("preset") or fontkit.DEFAULT_PRESET).lower()
    return value if value in fontkit.PRESETS else fontkit.DEFAULT_PRESET


# --- Эндпоинты -------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify(status="ok", woff2=fontkit.brotli_available())


@app.get("/api/formats")
def formats():
    return jsonify(
        targets=_TARGET_FORMATS,
        presets=[{"key": k, "default": k == fontkit.DEFAULT_PRESET}
                 for k in fontkit.PRESETS],
        woff2=fontkit.brotli_available(),
        limits={
            "maxFileSize": Config.MAX_FILE_SIZE,
            "maxFiles": Config.MAX_FILES,
        },
    )


@app.post("/api/analyze")
def analyze():
    files = request.files.getlist("fonts")
    if not files:
        return jsonify(error="Не передано ни одного файла (поле `fonts`)"), 400
    if len(files) > Config.MAX_FILES:
        return jsonify(error=f"Слишком много файлов (максимум {Config.MAX_FILES})"), 413

    preset = _preset(request)
    reports = []
    for storage in files:
        data = storage.read()
        if len(data) > Config.MAX_FILE_SIZE:
            reports.append({
                "filename": storage.filename,
                "ok": False,
                "error": f"Файл больше {Config.MAX_FILE_SIZE // (1024 * 1024)} МБ",
            })
            continue
        report = _analyze_data(data, preset)
        report["filename"] = storage.filename
        report["size"] = len(data)
        reports.append(report)

    return jsonify(reports=reports, preset=preset)


@app.post("/api/convert")
def convert():
    files = request.files.getlist("fonts")
    if not files:
        return jsonify(error="Не передано ни одного файла (поле `fonts`)"), 400
    if len(files) > Config.MAX_FILES:
        return jsonify(error=f"Слишком много файлов (максимум {Config.MAX_FILES})"), 413

    targets = _parse_targets(request)
    if not targets:
        return jsonify(error="Не выбран ни один целевой формат (поле `targets`)"), 400

    preset = _preset(request)
    multiple = len(files) > 1
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "targets": targets,
        "items": [],
    }
    summary = {"files": len(files), "targets": targets,
               "outputsOk": 0, "outputsFailed": 0, "warnings": [], "errors": []}

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for storage in files:
            data = storage.read()
            base = _safe_base(storage.filename)
            item = {"filename": storage.filename, "size": len(data),
                    "outputs": [], "errors": []}

            if len(data) > Config.MAX_FILE_SIZE:
                msg = f"Файл больше {Config.MAX_FILE_SIZE // (1024 * 1024)} МБ"
                item["errors"].append({"format": None, "error": msg})
                summary["errors"].append({"file": storage.filename, "error": msg})
                manifest["items"].append(item)
                continue

            # Контекст источника (формат, метаданные, покрытие) — в manifest.
            report = _analyze_data(data, preset)
            item["source"] = report.get("source")
            item["metadata"] = report.get("metadata")
            item["coverage"] = (report.get("coverage") or {}).get("categories") \
                if report.get("ok") else None
            item["kind"] = report.get("kind")
            item["image"] = report.get("image")

            # Если исходник не читается — фиксируем одну ошибку и не гоняем
            # конвертацию по всем форматам с одинаковым отказом.
            if not report.get("ok"):
                msg = report.get("error", "Не удалось прочитать шрифт")
                item["errors"].append({"format": None, "error": msg})
                summary["errors"].append({"file": storage.filename, "error": msg})
                manifest["items"].append(item)
                continue

            for tkey in targets:
                target_kind = _TARGETS_BY_KEY[tkey]["kind"]
                source_kind = report.get("kind", "font")
                if target_kind != source_kind:
                    continue
                res = (imagekit.convert_image(data, tkey) if source_kind == "image"
                       else fontkit.convert_font(data, tkey))
                if res["ok"]:
                    out_name = f"{base}.{res['ext']}"
                    arcname = f"{base}/{out_name}" if multiple else out_name
                    zf.writestr(arcname, res["data"])
                    item["outputs"].append({
                        "format": tkey,
                        "filename": out_name,
                        "arcname": arcname,
                        "size": len(res["data"]),
                        "outline": res["outline"],
                        "warnings": res["warnings"],
                    })
                    summary["outputsOk"] += 1
                    for w in res["warnings"]:
                        summary["warnings"].append(
                            {"file": storage.filename, "format": tkey, "warning": w})
                else:
                    item["errors"].append({"format": tkey, "error": res["error"]})
                    summary["outputsFailed"] += 1
                    summary["errors"].append(
                        {"file": storage.filename, "format": tkey,
                         "error": res["error"]})

            manifest["items"].append(item)

        zf.writestr("manifest.json",
                    json.dumps(manifest, ensure_ascii=False, indent=2))

    # Если вообще ничего не сконвертировалось — 422 с текстом вместо архива.
    if summary["outputsOk"] == 0:
        return jsonify(error="Ни один файл не удалось сконвертировать",
                       details=summary["errors"]), 422

    zip_buffer.seek(0)
    # Компактная сводка в заголовок (списки подрезаем, детали — в manifest.json).
    header_summary = {
        **summary,
        "warnings": summary["warnings"][:20],
        "errors": summary["errors"][:20],
    }
    b64 = base64.b64encode(
        json.dumps(header_summary, ensure_ascii=False).encode("utf-8")
    ).decode("ascii")

    response = send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="converted-files.zip",
    )
    response.headers["X-Summary"] = b64
    return response


@app.post("/api/webfont")
def webfont():
    """Подготовить пользовательский UI-шрифт для общей верхней панели.

    Использует то же ядро fontkit, что основной конвертер, но возвращает WOFF и
    WOFF2 прямо в JSON: shell может сразу зарегистрировать FontFace без ZIP.
    """
    storage = request.files.get("font")
    if storage is None:
        return jsonify(error="Не передан шрифт"), 400
    data = storage.read()
    if not data or len(data) > Config.MAX_FILE_SIZE:
        return jsonify(error="Пустой или слишком большой файл"), 413
    report = _analyze_data(data, fontkit.DEFAULT_PRESET)
    if not report.get("ok") or report.get("kind") != "font":
        return jsonify(error=report.get("error", "Формат шрифта не поддерживается")), 422
    outputs = {}
    warnings = []
    for target in ("woff2", "woff"):
        result = fontkit.convert_font(data, target)
        if result.get("ok"):
            outputs[target] = base64.b64encode(result["data"]).decode("ascii")
            warnings.extend(result.get("warnings") or [])
    if not outputs:
        return jsonify(error="Не удалось получить веб-формат шрифта"), 422
    family = (report.get("metadata") or {}).get("family") or _safe_base(storage.filename)
    return jsonify(family=family, outputs=outputs, warnings=warnings)


@app.errorhandler(413)
def too_large(_err):
    return jsonify(error="Превышен лимит размера запроса"), 413


if __name__ == "__main__":
    app.run(host=Config.HOST, port=Config.PORT, debug=True)
