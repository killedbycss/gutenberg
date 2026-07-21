"""Реестр правил.

Порядок в списке = порядок применения проходов. Он важен:
  • кавычки и апострофы идут первыми (не зависят от тире/пробелов);
  • тире расставляются до NBSP-перед-тире, иначе «—» ещё нет;
  • NBSP-правила идут в конце.

Добавление нового языка = добавление правил с нужными langs и регистрация
их здесь. Ядро (engine) при этом не меняется.
"""

from .quotes import DoubleQuoteRule, ApostropheRule
from .dashes import DialogueDashRule, ThoughtDashRule, RangeDashRule
from .spaces import ShortWordNbspRule, InitialsNbspRule, DashNbspRule

# Экземпляры правил в порядке применения.
REGISTRY = [
    DoubleQuoteRule(),
    ApostropheRule(),
    DialogueDashRule(),
    ThoughtDashRule(),
    RangeDashRule(),
    ShortWordNbspRule(),
    InitialsNbspRule(),
    DashNbspRule(),
]

# Метаданные типов правок — для фронта (чекбоксы) и /api/rules.
RULE_TYPES = [
    {"id": "quotes", "title": "Кавычки и апострофы",
     "description": "«ёлочки» / “curly”, вложенные кавычки, апострофы don’t"},
    {"id": "dashes", "title": "Тире",
     "description": "диалог, диапазон значений, разрыв мысли"},
    {"id": "nbsp", "title": "Неразрывные пробелы",
     "description": "короткие слова, инициалы, перед тире"},
]

DEFAULT_ENABLED = ["quotes", "dashes", "nbsp"]
