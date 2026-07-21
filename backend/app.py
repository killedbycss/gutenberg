"""Flask API типографа.

Эндпоинты
---------
GET  /api/rules    — метаданные типов правок (для чекбоксов на фронте).
POST /api/correct  — принять текст + опции, вернуть исправленный текст и
                     список правок с позициями в итоговом тексте.
GET  /api/health   — проверка живости.

CORS включён вручную (без зависимостей), чтобы фронт на Vite (порт 5173)
мог обращаться к API. Порт задаётся переменной окружения PORT (по умолчанию
5050 — 5000 на macOS занят AirPlay/ControlCenter).
"""

import os

from flask import Flask, request, jsonify

from typography import Typographer, RULE_TYPES, DEFAULT_ENABLED

app = Flask(__name__)

MAX_TEXT_LEN = 100_000


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/health")
def health():
    return jsonify(status="ok")


@app.route("/api/rules")
def rules():
    return jsonify(types=RULE_TYPES, default_enabled=DEFAULT_ENABLED)


@app.route("/api/correct", methods=["POST", "OPTIONS"])
def correct():
    if request.method == "OPTIONS":  # preflight
        return ("", 204)

    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    if not isinstance(text, str):
        return jsonify(error="`text` должен быть строкой"), 400
    if len(text) > MAX_TEXT_LEN:
        return jsonify(error=f"Текст длиннее {MAX_TEXT_LEN} символов"), 413

    enabled = data.get("enabled_types", DEFAULT_ENABLED)
    if not isinstance(enabled, list):
        enabled = DEFAULT_ENABLED
    en_dash_style = data.get("en_dash_style", "us")
    exceptions = data.get("exceptions", [])
    if not isinstance(exceptions, list):
        exceptions = []
    default_lang = data.get("default_lang", "auto")

    typographer = Typographer(
        enabled_types=enabled,
        en_dash_style=en_dash_style,
        exceptions=[str(e) for e in exceptions],
        default_lang=default_lang if default_lang in ("auto", "ru", "en") else "auto",
    )
    result, edits = typographer.process(text)

    return jsonify(
        original=text,
        result=result,
        edits=[e.to_dict() for e in edits],
        count=len(edits),
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    app.run(host="127.0.0.1", port=port, debug=True)
