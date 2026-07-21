"""Определение языка фрагмента текста.

Для типографики нам не нужен полноценный language-detection: достаточно
различать кириллицу и латиницу и уметь спросить «какой язык в этой позиции
текста». Это покрывает и одноязычный, и смешанный RU/EN текст.
"""

import re

CYRILLIC_RE = re.compile(r"[А-Яа-яЁё]")
LATIN_RE = re.compile(r"[A-Za-z]")

# Границы предложений: конечная пунктуация + пробел, либо перевод строки.
SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[.!?…])[ \t]+|\n+")


def detect_lang(fragment: str) -> str:
    """Вернуть 'ru', 'en' или 'neutral' для фрагмента текста.

    Считаем буквы каждого алфавита; побеждает тот, которого больше.
    Ничья и отсутствие букв трактуются как 'neutral' → вызывающий код
    сам решает, какой язык взять по умолчанию.
    """
    cyr = len(CYRILLIC_RE.findall(fragment))
    lat = len(LATIN_RE.findall(fragment))
    if cyr == 0 and lat == 0:
        return "neutral"
    if cyr == lat:
        return "neutral"
    return "ru" if cyr > lat else "en"


def sentence_spans(text: str):
    """Разбить текст на предложения, сохранив смещения.

    Возвращает список кортежей (start, end, lang) в координатах исходного
    текста. Используется правилами тире и пробелов, которым важен язык
    окружающего предложения.
    """
    spans = []
    start = 0
    for m in SENTENCE_BOUNDARY_RE.finditer(text):
        end = m.end()
        if end > start:
            spans.append((start, end))
        start = end
    if start < len(text):
        spans.append((start, len(text)))
    return [(s, e, detect_lang(text[s:e])) for s, e in spans]


class LangResolver:
    """Быстрый доступ к языку по позиции символа.

    Пересобирается на каждый проход движка, потому что координаты
    сдвигаются после внесения правок.
    """

    def __init__(self, text: str, default: str = "ru"):
        self.text = text
        self.spans = sentence_spans(text)
        whole = detect_lang(text)
        fallback = default if default in ("ru", "en") else "ru"
        self.default = whole if whole != "neutral" else fallback

    def at(self, pos: int) -> str:
        """Язык предложения, содержащего позицию pos."""
        for start, end, lang in self.spans:
            if start <= pos < end:
                return lang if lang != "neutral" else self.default
        return self.default
