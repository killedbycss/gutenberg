"""Правила кавычек и апострофов.

Прямые кавычки (") превращаются в дизайнерские с учётом языка и уровня
вложенности:
    RU:  внешние «ёлочки», внутренние „лапки"
    EN:  внешние “curly”, внутренние ‘single’
Апострофы (') в английском (don't → don’t, dogs' → dogs’) заменяются на ’.
"""

import re

from .base import Rule, Replacement, TYPE_QUOTES
from ..language import detect_lang

# После этих символов (или в начале строки) прямая кавычка считается
# ОТКРЫВАЮЩЕЙ. Иначе — закрывающей.
OPEN_CONTEXT = set(" \t\n\r([{«„“‘—–- ")

QUOTE_GLYPHS = {
    "ru": [("«", "»"), ("“", "”")],
    "en": [("«", "»"), ("“", "”")],
}

LETTER_RE = re.compile(r"[A-Za-zА-Яа-яЁё]")
WORDCHAR_RE = re.compile(r"[A-Za-zА-Яа-яЁё0-9]")


def _glyphs_for(lang, level):
    table = QUOTE_GLYPHS.get(lang, QUOTE_GLYPHS["ru"])
    return table[min(level, len(table) - 1)]


class DoubleQuoteRule(Rule):
    """Парные прямые двойные кавычки → типографские, с учётом вложенности."""

    rule_type = TYPE_QUOTES
    rule_id = "double_quotes"
    langs = ("ru", "en")

    def find(self, text, ctx):
        repls = []
        stack = []  # индексы открывающих кавычек
        for i, ch in enumerate(text):
            if ch != '"':
                continue
            prev = text[i - 1] if i > 0 else ""
            is_open = (i == 0) or (prev in OPEN_CONTEXT)
            if is_open or not stack:
                stack.append(i)
            else:
                open_i = stack.pop()
                level = len(stack)  # сколько ещё пар снаружи
                inner = text[open_i + 1:i]
                lang = detect_lang(inner)
                if lang == "neutral":
                    lang = ctx.lang.at(open_i)
                open_g, close_g = _glyphs_for(lang, level)
                repls.append(Replacement(
                    open_i, open_i + 1, open_g, self.rule_type, self.rule_id,
                    "Открывающая кавычка", lang))
                repls.append(Replacement(
                    i, i + 1, close_g, self.rule_type, self.rule_id,
                    "Закрывающая кавычка", lang))
        return repls


class ApostropheRule(Rule):
    """Прямой апостроф между буквами/после буквы → типографский ’.

    Ловим сокращения и притяжательные: don't, we're, o'clock, dogs',
    д'Артаньян, а также усечения годов '90s.
    """

    rule_type = TYPE_QUOTES
    rule_id = "apostrophe"
    langs = ("ru", "en")

    def find(self, text, ctx):
        repls = []
        for i, ch in enumerate(text):
            if ch != "'":
                continue
            prev = text[i - 1] if i > 0 else ""
            nxt = text[i + 1] if i + 1 < len(text) else ""
            letter_before = bool(LETTER_RE.match(prev))
            word_after = bool(WORDCHAR_RE.match(nxt))
            # апостроф внутри слова, либо в хвосте слова (dogs'), либо '90
            is_apostrophe = (
                (letter_before and word_after)
                or (letter_before and not word_after)
                or (prev in " \t\n\r([" and nxt.isdigit())
            )
            if is_apostrophe:
                repls.append(Replacement(
                    i, i + 1, "’", self.rule_type, self.rule_id,
                    "Апостроф", "en"))
        return repls
