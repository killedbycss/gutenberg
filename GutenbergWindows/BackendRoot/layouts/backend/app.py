"""Тонкий Flask-сервис: байты шрифта → JSON с типографскими метриками.

Единственная задача сервиса — разбор шрифта и расчёт метрик (см. fontmetrics).
Вся логика подбора макета и рендеринг превью живут на фронтенде. Результат
кэшируется по SHA-256 содержимого файла, чтобы не парсить один и тот же шрифт
повторно.

Эндпоинты
---------
GET  /api/health   — живость сервиса + размер кэша.
POST /api/metrics  — принять файл шрифта (multipart, поле `font`), вернуть
                     метрики. Ответ: {"metrics": {...}, "cached": bool}.
"""

from __future__ import annotations

import hashlib
import os
from collections import OrderedDict

from flask import Flask, jsonify, request
from flask_cors import CORS

from config import Config
from fontmetrics import FontMetricsError, compute_metrics

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH
CORS(app)

# Простой LRU-кэш метрик по хэшу файла (в памяти процесса).
_cache: "OrderedDict[str, dict]" = OrderedDict()


def _cache_get(key: str):
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    return None


def _cache_put(key: str, value: dict) -> None:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > Config.CACHE_SIZE:
        _cache.popitem(last=False)


def _allowed(filename: str | None) -> bool:
    ext = os.path.splitext(filename or "")[1].lower()
    return ext in Config.ALLOWED_EXT


@app.get("/api/health")
def health():
    return jsonify(status="ok", cached=len(_cache))


@app.post("/api/metrics")
def metrics():
    storage = request.files.get("font")
    if storage is None:
        return jsonify(error="Не передан файл шрифта (поле `font`)"), 400
    if not _allowed(storage.filename):
        return jsonify(error="Поддерживаются только OTF, TTF, WOFF, WOFF2, TTC"), 415

    data = storage.read()
    if not data:
        return jsonify(error="Пустой файл"), 400
    if len(data) > Config.MAX_FILE_SIZE:
        limit = Config.MAX_FILE_SIZE // (1024 * 1024)
        return jsonify(error=f"Файл больше {limit} МБ"), 413

    key = hashlib.sha256(data).hexdigest()
    cached = _cache_get(key)
    if cached is not None:
        return jsonify(metrics=cached, cached=True)

    try:
        result = compute_metrics(data)
    except FontMetricsError as exc:
        return jsonify(error=str(exc)), 422

    _cache_put(key, result)
    return jsonify(metrics=result, cached=False)


@app.errorhandler(413)
def too_large(_err):
    return jsonify(error="Превышен лимит размера запроса"), 413


if __name__ == "__main__":
    app.run(host=Config.HOST, port=Config.PORT, debug=True)
