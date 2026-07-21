"""Чистая логика обработки ответа LanguageTool.

Здесь нет сетевых вызовов и зависимостей от Flask — модуль легко тестировать.
"""
from typing import Dict, List, Set

# Категории LanguageTool, которые считаем «стилем».
# Включаются только когда пользователь включил тумблер проверки стиля.
STYLE_CATEGORIES: Set[str] = {
    "STYLE",
    "REDUNDANCY",          # тавтология, многословие
    "PLAIN_ENGLISH",
    "COLLOQUIALISMS",
    "SEMANTICS",
    "CREATIVE_WRITING",
    "GENDER_NEUTRALITY",
    "WIKIPEDIA",
}

# issueType из LanguageTool, которые относим к стилю.
STYLE_ISSUE_TYPES: Set[str] = {"style", "register", "locale-violation"}


def classify(match: dict) -> str:
    """Свести правило LanguageTool к одному из типов для подсветки во фронтенде.

    Возвращает: 'spelling' | 'grammar' | 'punctuation' | 'style'.
    """
    rule = match.get("rule", {}) or {}
    category_id = (rule.get("category", {}) or {}).get("id", "") or ""
    issue = rule.get("issueType", "") or ""

    if category_id in ("TYPOS", "CASING") or issue == "misspelling":
        return "spelling"
    if category_id in ("PUNCTUATION", "TYPOGRAPHY") or issue in (
        "typographical",
        "whitespace",
    ):
        return "punctuation"
    if category_id in STYLE_CATEGORIES or issue in STYLE_ISSUE_TYPES:
        return "style"
    return "grammar"


def normalize(match: dict, max_replacements: int = 8) -> dict:
    """Привести объект match из LanguageTool к компактному виду для клиента."""
    rule = match.get("rule", {}) or {}
    replacements = [
        r.get("value", "")
        for r in (match.get("replacements") or [])
        if r.get("value") is not None
    ]
    return {
        "offset": match["offset"],
        "length": match["length"],
        "message": match.get("message", ""),
        "shortMessage": match.get("shortMessage", ""),
        "replacements": replacements[:max_replacements],
        "type": classify(match),
        "rule": {
            "id": rule.get("id"),
            "category": (rule.get("category", {}) or {}).get("name"),
        },
        "context": match.get("context", {}),
    }


def flagged_text(text: str, match: dict) -> str:
    """Вернуть подстроку исходного текста, к которой относится ошибка."""
    start = match["offset"]
    end = start + match["length"]
    return text[start:end]


def apply_dictionary(
    text: str, matches: List[dict], words: List[str]
) -> List[dict]:
    """Убрать из результата орфографические ошибки на словах из словаря исключений.

    Фильтрация применяется только к типу 'spelling' — грамматика и пунктуация
    для «известных» слов остаются, так как относятся не к самому слову.
    """
    if not words:
        return matches
    allow = {w.strip().lower() for w in words if w.strip()}
    result = []
    for m in matches:
        if m.get("type") == "spelling":
            token = flagged_text(text, m).strip().lower()
            if token in allow:
                continue
        result.append(m)
    return result
