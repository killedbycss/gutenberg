"""HTTP-клиент к LanguageTool.

Архитектура прежняя: Flask ходит по HTTP к REST API LanguageTool (/v2/check).
По умолчанию используется ОНЛАЙН-сервис (api.languagetool.org) — ничего ставить
не нужно (ни Docker, ни Java), «словарь» подгружается онлайн. Нужен только
интернет. Приватную/офлайн-проверку можно включить, задав LT_URL на свой сервер.
"""
from typing import Optional

import requests

from processing import STYLE_CATEGORIES

# Заголовок для вежливого обращения к публичному сервису.
_HEADERS = {"User-Agent": "GutenbergStudio/1.0 (orthography module)"}


class LanguageToolError(RuntimeError):
    """Ошибка обращения к серверу LanguageTool."""


class LanguageToolClient:
    def __init__(self, base_url: str, timeout: float = 20.0):
        base = (base_url or "").rstrip("/")
        self.base = base
        self.check_url = f"{base}/v2/check"
        self.languages_url = f"{base}/v2/languages"
        self.timeout = timeout

    def ping(self) -> bool:
        """Доступен ли сервис LanguageTool (есть ли соединение)."""
        try:
            r = requests.get(self.languages_url, headers=_HEADERS, timeout=min(self.timeout, 6))
            return r.status_code == 200
        except requests.RequestException:
            return False

    def check(self, text: str, language: str = "auto", enable_style: bool = False) -> dict:
        """Отправить текст на проверку. Ответ — JSON LanguageTool (/v2/check)."""
        data = {"text": text, "language": language or "auto"}
        # В авторежиме подсказываем предпочтительные варианты языков.
        if data["language"] == "auto":
            data["preferredVariants"] = "en-US,ru-RU,de-DE"
        if enable_style:
            data["level"] = "picky"  # больше стилистических подсказок
        else:
            data["disabledCategories"] = ",".join(sorted(STYLE_CATEGORIES))

        try:
            resp = requests.post(self.check_url, data=data, headers=_HEADERS, timeout=self.timeout)
            if resp.status_code == 429:
                raise LanguageToolError(
                    "Превышен лимит бесплатного онлайн-LanguageTool. Подождите минуту "
                    "или поднимите свой сервер и задайте LT_URL."
                )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            raise LanguageToolError(str(exc)) from exc


def detected_language(lt_response: dict) -> Optional[dict]:
    """Вытащить определённый язык из ответа LanguageTool."""
    lang = lt_response.get("language", {}) or {}
    detected = lang.get("detectedLanguage", {}) or {}
    code = detected.get("code") or lang.get("code")
    name = detected.get("name") or lang.get("name")
    if not code:
        return None
    return {"code": code, "name": name}
