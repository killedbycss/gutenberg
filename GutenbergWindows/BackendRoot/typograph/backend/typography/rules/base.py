"""Базовые типы для правил типографики.

Каждое правило — отдельный класс (см. реестр в rules/__init__.py), что
позволяет добавлять новые языки и новые виды правок, не трогая ядро.
"""

from dataclasses import dataclass, field, asdict

# Типы правок для чекбоксов на фронте (группировка правил).
TYPE_QUOTES = "quotes"
TYPE_DASHES = "dashes"
TYPE_NBSP = "nbsp"

NBSP = " "  # неразрывный пробел


@dataclass
class Replacement:
    """Одна замена, вычисленная правилом в координатах ТЕКУЩЕГО текста.

    start/end — полуинтервал заменяемого участка, new — что подставить.
    """

    start: int
    end: int
    new: str
    rule_type: str      # 'quotes' | 'dashes' | 'nbsp'
    rule: str           # машинный идентификатор конкретного правила
    message: str        # человекочитаемое описание (RU) для тултипа
    lang: str = "neutral"


@dataclass
class Edit:
    """Внесённая правка в координатах ИТОГОВОГО текста.

    Копит достаточно данных, чтобы фронт умел подсветить участок и
    откатить его (undo): original — что было, new — что стало.

    osrc_start/osrc_end — координаты в ИСХОДНОМ тексте (не сдвигаются между
    проходами). Нужны движку, чтобы корректно сливать пересекающиеся правки.
    Наружу (в API) не отдаются.
    """

    start: int
    end: int
    original: str
    new: str
    rule_type: str
    rule: str
    message: str
    lang: str = "neutral"
    osrc_start: int = 0
    osrc_end: int = 0
    id: int = 0

    _API_FIELDS = ("start", "end", "original", "new", "osrc_start", "osrc_end",
                   "rule_type", "rule", "message", "lang", "id")

    def shift(self, delta: int):
        self.start += delta
        self.end += delta

    def to_dict(self):
        d = asdict(self)
        return {k: d[k] for k in self._API_FIELDS}


class Rule:
    """Абстрактное правило.

    Наследники задают rule_type (для чекбоксов), langs (к каким языкам
    применяется) и реализуют find(), возвращающий список Replacement.
    """

    rule_type = None
    rule_id = None
    langs = ("ru", "en")  # 'any' — применять независимо от языка

    def enabled_for(self, enabled_types) -> bool:
        return self.rule_type in enabled_types

    def find(self, text, ctx):
        raise NotImplementedError


@dataclass
class RuleContext:
    """Контекст одного прохода: язык по позиции + пользовательские опции."""

    lang: object                       # LangResolver
    en_dash_style: str = "us"          # 'us' | 'uk'
    options: dict = field(default_factory=dict)
