"""Правила тире.

Три контекста, как в ТЗ:
  1. Диалог          — дефис/двойной дефис в начале строки → «— » (em dash).
  2. Разрыв мысли    — дефис в пробелах между словами → тире по языку/стилю.
  3. Диапазон значений — дефис между числами → «–» (en dash) без пробелов.

Составные слова (какой-то, well-known) не трогаем: у них дефис без пробелов
между буквами.
"""

import re

from .base import Rule, Replacement, TYPE_DASHES

EM = "—"  # длинное тире (em dash)
EN = "–"  # среднее тире (en dash)


class DialogueDashRule(Rule):
    """Начало строки: «- реплика» / «-- реплика» → «— реплика».

    Применяем только к русским строкам, чтобы не ломать англоязычные
    маркированные списки, которые тоже начинаются с «- ».
    """

    rule_type = TYPE_DASHES
    rule_id = "dialogue_dash"
    langs = ("ru",)

    pattern = re.compile(r"^([ \t]*)(-{1,2})([ \t]+)(?=\S)", re.MULTILINE)

    def find(self, text, ctx):
        repls = []
        for m in self.pattern.finditer(text):
            dash_start = m.start(2)
            if ctx.lang.at(dash_start) != "ru":
                continue
            repls.append(Replacement(
                m.start(2), m.end(2), EM, self.rule_type, self.rule_id,
                "Тире в диалоге", "ru"))
        return repls


class ThoughtDashRule(Rule):
    """Дефис в пробелах между словами → тире (разрыв мысли, приложение).

    RU:        слово — слово   (длинное тире, пробелы; NBSP добавит другое правило)
    EN (US):   word—word       (em dash без пробелов)
    EN (UK):   word – word     (en dash с пробелами)
    Также ASCII-конструкция «word--word» без пробелов трактуется как тире.
    """

    rule_type = TYPE_DASHES
    rule_id = "thought_dash"
    langs = ("ru", "en")

    spaced = re.compile(r"(?<=\S)([ \t]+)(-{1,2})([ \t]+)(?=\S)")
    glued = re.compile(r"(?<=\w)(--)(?=\w)")

    def find(self, text, ctx):
        repls = []
        for m in self.spaced.finditer(text):
            lang = ctx.lang.at(m.start(2))
            if lang == "en" and ctx.en_dash_style == "us":
                # US: word—word — убираем пробелы, заменяем весь участок.
                repls.append(Replacement(
                    m.start(1), m.end(3), EM, self.rule_type, self.rule_id,
                    "Тире (разрыв мысли, US)", lang))
            else:
                # RU / EN-UK: пробелы сохраняем, меняем только дефис на тире.
                # Так соседний пробел остаётся отдельным символом и правило
                # NBSP-перед-тире не пересекается с этой правкой.
                glyph = EN if lang == "en" else EM
                msg = "Тире (разрыв мысли, UK)" if lang == "en" else "Тире (разрыв мысли)"
                repls.append(Replacement(
                    m.start(2), m.end(2), glyph, self.rule_type, self.rule_id,
                    msg, lang))
        for m in self.glued.finditer(text):
            lang = ctx.lang.at(m.start(1))
            if lang == "en" and ctx.en_dash_style == "uk":
                new = " " + EN + " "
            elif lang == "en":
                new = EM
            else:
                new = " " + EM + " "
            repls.append(Replacement(
                m.start(1), m.end(1), new, self.rule_type, self.rule_id,
                "Тире (разрыв мысли)", lang))
        return repls


class RangeDashRule(Rule):
    """Диапазон чисел: 1990-2000, 5-10 → 1990–2000, 5–10 (en dash, без пробелов).

    Негативные lookaround'ы отсекают ISO-даты (2020-01-01) и цепочки вроде
    телефонов (8-800-555), где дефисов больше одного подряд.
    """

    rule_type = TYPE_DASHES
    rule_id = "range_dash"
    langs = ("ru", "en")

    pattern = re.compile(r"(?<![-\d])(\d{1,4})[ \t]?-[ \t]?(\d{1,4})(?![-\d])")

    def find(self, text, ctx):
        repls = []
        for m in self.pattern.finditer(text):
            new = m.group(1) + EN + m.group(2)
            repls.append(Replacement(
                m.start(), m.end(), new, self.rule_type, self.rule_id,
                "Тире диапазона", ctx.lang.at(m.start())))
        return repls
