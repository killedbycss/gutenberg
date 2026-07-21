"""Flask API проверки орфографии/грамматики поверх LanguageTool.

Эндпоинты:
    GET  /api/health              — доступность LanguageTool
    POST /api/check               — проверка текста, возвращает ошибки с позициями
    GET  /api/dictionary          — список слов-исключений
    POST /api/dictionary          — добавить слово {"word": "..."}
    DELETE /api/dictionary/<word> — удалить слово
"""
from flask import Flask, jsonify, request
from flask_cors import CORS

from config import Config
from dictionary import UserDictionary
from languagetool_client import (
    LanguageToolClient,
    LanguageToolError,
    detected_language,
)
from processing import apply_dictionary, normalize

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)  # для локальной разработки фронтенда на другом порту

lt = LanguageToolClient(Config.LT_URL, Config.LT_TIMEOUT)
user_dict = UserDictionary(Config.DICT_PATH)


@app.get("/api/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "languagetool": lt.ping(),
            "ltUrl": Config.LT_URL,
        }
    )


@app.post("/api/check")
def check():
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    language = body.get("language", "auto") or "auto"
    enable_style = bool(body.get("enableStyle", False))

    if not isinstance(text, str):
        return jsonify({"error": "invalid_text"}), 400
    if len(text) > Config.MAX_TEXT_LEN:
        return jsonify({"error": "text_too_long", "maxLen": Config.MAX_TEXT_LEN}), 413
    if not text.strip():
        return jsonify({"matches": [], "language": None})

    try:
        raw = lt.check(text, language=language, enable_style=enable_style)
    except LanguageToolError as exc:
        return (
            jsonify(
                {
                    "error": "languagetool_unavailable",
                    "detail": str(exc),
                    "hint": "Проверка орфографии работает онлайн — проверьте интернет. "
                            "Для локальной/приватной проверки задайте LT_URL на свой сервер.",
                }
            ),
            503,
        )

    matches = [normalize(m) for m in raw.get("matches", [])]
    matches = apply_dictionary(text, matches, user_dict.list())

    return jsonify(
        {
            "matches": matches,
            "language": detected_language(raw),
        }
    )


@app.get("/api/dictionary")
def dictionary_list():
    return jsonify({"words": user_dict.list()})


@app.post("/api/dictionary")
def dictionary_add():
    body = request.get_json(silent=True) or {}
    word = body.get("word", "")
    if not isinstance(word, str) or not word.strip():
        return jsonify({"error": "empty_word"}), 400
    return jsonify({"words": user_dict.add(word)})


@app.delete("/api/dictionary/<path:word>")
def dictionary_remove(word):
    return jsonify({"words": user_dict.remove(word)})


if __name__ == "__main__":
    app.run(host=Config.HOST, port=Config.PORT, debug=True)
