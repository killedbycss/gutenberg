"""Правила неразрывных пробелов (NBSP, U+00A0).

  1. После коротких слов (1–2 буквы): предлоги/союзы «в», «на», «и», «a», «to»…
     — чтобы они не «повисали» в конце строки.
  2. Между инициалами и перед фамилией: А. С. Пушкин → А. С. Пушкин.
  3. Перед тире в конструкции «слово — слово»: чтобы тире не начинало строку.

Правило NBSP-перед-тире выполняется ПОСЛЕ правил тире (в реестре оно идёт
позже), поэтому к этому моменту «—»/«–» уже расставлены.
"""

import re

from .base import Rule, Replacement, TYPE_NBSP, NBSP

# Классы символов (кириллица + латиница).
_L = r"A-Za-zА-Яа-яЁё"
_W = r"A-Za-zА-Яа-яЁё0-9"


class ShortWordNbspRule(Rule):
    """Короткое слово + пробел → приклеиваем к следующему слову.

    RU: любое слово 1–2 буквы (в, на, и, до…). EN: только однобуквенные
    «a»/«I» — в английской типографике клеить все короткие предлоги не
    принято, а вот сироты-однобуквенники убирать желательно.

    В негативный lookbehind добавлены апострофы: иначе хвост «’t» в don’t
    ошибочно считался бы самостоятельным словом.
    """

    rule_type = TYPE_NBSP
    rule_id = "short_word_nbsp"
    langs = ("ru", "en")

    pattern = re.compile(
        r"(?<![" + _W + r"'’-])([" + _L + r"]{1,2}) (?=[" + _W + r"«\"“„‘(])"
    )

    def find(self, text, ctx):
        repls = []
        for m in self.pattern.finditer(text):
            word = m.group(1)
            lang = ctx.lang.at(m.start(1))
            if lang == "en" and len(word) > 1:
                continue  # в английском клеим только «a»/«I»
            space_pos = m.end(1)  # позиция пробела сразу после короткого слова
            repls.append(Replacement(
                space_pos, space_pos + 1, NBSP, self.rule_type, self.rule_id,
                "Неразрывный пробел после короткого слова", lang))
        return repls


class InitialsNbspRule(Rule):
    """Инициалы: «А. С. Пушкин» и «А. Пушкин» → пробелы заменяются на NBSP."""

    rule_type = TYPE_NBSP
    rule_id = "initials_nbsp"
    langs = ("ru", "en")

    two = re.compile(
        r"([" + _L + r"])\.[ ]+([" + _L + r"])\.[ ]+([" + _L + r"][" + _L + r"]+)"
    )
    one = re.compile(
        r"(?<![" + _L + r"])([" + _L + r"])\.[ ]+([" + _L + r"][" + _L + r"]+)"
    )

    def find(self, text, ctx):
        repls = []
        taken = []  # чтобы «one» не пересекалось с «two»
        for m in self.two.finditer(text):
            new = f"{m.group(1)}.{NBSP}{m.group(2)}.{NBSP}{m.group(3)}"
            repls.append(Replacement(
                m.start(), m.end(), new, self.rule_type, self.rule_id,
                "Неразрывный пробел между инициалами", ctx.lang.at(m.start())))
            taken.append((m.start(), m.end()))
        for m in self.one.finditer(text):
            if any(s <= m.start() < e for s, e in taken):
                continue
            new = f"{m.group(1)}.{NBSP}{m.group(2)}"
            repls.append(Replacement(
                m.start(), m.end(), new, self.rule_type, self.rule_id,
                "Неразрывный пробел перед фамилией", ctx.lang.at(m.start())))
        return repls


class DashNbspRule(Rule):
    """«слово — слово» → «слово — слово»: NBSP перед тире."""

    rule_type = TYPE_NBSP
    rule_id = "dash_nbsp"
    langs = ("ru", "en")

    pattern = re.compile(r"(\S) ([—–])(?= )")

    def find(self, text, ctx):
        repls = []
        for m in self.pattern.finditer(text):
            space_pos = m.start(1) + 1
            repls.append(Replacement(
                space_pos, space_pos + 1, NBSP, self.rule_type, self.rule_id,
                "Неразрывный пробел перед тире", ctx.lang.at(m.start())))
        return repls
