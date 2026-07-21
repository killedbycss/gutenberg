"""Мини-мок сервера LanguageTool для локальной разработки БЕЗ Docker.

Это НЕ настоящий движок — просто несколько регулярных правил, чтобы увидеть,
как работает интерфейс (подчёркивания, попап, словарь), пока не запущен
настоящий LanguageTool. Возвращает ответ в схеме LanguageTool /v2/check.

Запуск:  python dev-tools/mock_languagetool.py   (слушает :8010)
Затем поднимите backend и frontend как обычно.
"""
import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

# (regex, [замены], category_id, issueType). Регистронезависимо.
RULES = [
    (r"[ ]{2,}", [" "], "PUNCTUATION", "whitespace"),
    (r"руском", ["русском"], "TYPOS", "misspelling"),
    (r"ашибка", ["ошибка"], "TYPOS", "misspelling"),
    (r"запятые например", ["запятые, например"], "PUNCTUATION", "typographical"),
    (r"\bThis are\b", ["This is"], "GRAMMAR", "grammar"),
    (r"\berors\b", ["errors"], "TYPOS", "misspelling"),
    (r"\benglish\b", ["English"], "CASING", "misspelling"),
    (r"\bin the end of\b", ["at the end of"], "GRAMMAR", "grammar"),
    # «стилевое» правило — присылается только если стиль не отключён
    (r"в конце концов", ["в итоге"], "REDUNDANCY", "style"),
]

CATEGORY_NAMES = {
    "TYPOS": "Орфография",
    "GRAMMAR": "Грамматика",
    "PUNCTUATION": "Пунктуация",
    "CASING": "Регистр",
    "REDUNDANCY": "Многословие",
}


def build_matches(text, disabled):
    matches = []
    for pattern, repls, cat, issue in RULES:
        if cat in disabled:
            continue
        for mo in re.finditer(pattern, text, flags=re.IGNORECASE):
            matches.append(
                {
                    "message": f"{CATEGORY_NAMES.get(cat, cat)}: возможная ошибка.",
                    "shortMessage": CATEGORY_NAMES.get(cat, cat),
                    "replacements": [{"value": r} for r in repls],
                    "offset": mo.start(),
                    "length": mo.end() - mo.start(),
                    "context": {"text": text, "offset": mo.start(),
                                "length": mo.end() - mo.start()},
                    "rule": {
                        "id": f"MOCK_{cat}",
                        "issueType": issue,
                        "category": {"id": cat, "name": CATEGORY_NAMES.get(cat, cat)},
                    },
                }
            )
    matches.sort(key=lambda m: m["offset"])
    return matches


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        self._send(200, [{"code": "ru-RU", "name": "Russian"},
                         {"code": "en-US", "name": "English"}])

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        params = parse_qs(self.rfile.read(n).decode("utf-8"))
        text = params.get("text", [""])[0]
        disabled = set(params.get("disabledCategories", [""])[0].split(","))
        # определяем «язык» по наличию кириллицы
        is_ru = bool(re.search(r"[а-яё]", text, re.IGNORECASE))
        lang = {"name": "Russian", "code": "ru-RU"} if is_ru else {
            "name": "English", "code": "en-US"}
        self._send(200, {
            "language": {**lang, "detectedLanguage": lang},
            "matches": build_matches(text, disabled),
        })

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("Mock LanguageTool на http://localhost:8010  (Ctrl+C для выхода)")
    HTTPServer(("127.0.0.1", 8010), Handler).serve_forever()
