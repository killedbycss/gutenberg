"""Движок типографики: применяет правила проходами и собирает список правок.

Работа с позициями
-------------------
Каждое правило применяется отдельным проходом по ТЕКУЩЕМУ тексту. Чтобы у
итоговых правок были корректные координаты и корректный undo, движок ведёт
две вещи:

  • edits — правки с координатами в текущем тексте; после каждого прохода
    ранее записанные сдвигаются на дельту замен левее них;
  • omap  — для каждого символа текущего текста его позиция в ИСХОДНОМ тексте
    (для вставленных символов — начало заменённого участка). По omap движок
    знает исходный диапазон каждой правки.

В конце пересекающиеся правки сливаются в одну (overlap-merge). Это делает
результат корректным при любом взаимодействии правил — например, когда
NBSP-перед-тире затрагивает пробел, вставленный правилом тире.
"""

import re

from .language import LangResolver
from .rules import REGISTRY, DEFAULT_ENABLED
from .rules.base import Edit, RuleContext

# Приоритет типа при слиянии (чей цвет/подпись станут «главными»).
_TYPE_PRIORITY = {"dashes": 3, "quotes": 2, "nbsp": 1}


def _protected_spans(text, exceptions):
    """Диапазоны, которые нельзя трогать (пользовательский словарь исключений)."""
    spans = []
    for word in exceptions:
        word = word.strip()
        if not word:
            continue
        for m in re.finditer(re.escape(word), text, re.IGNORECASE):
            spans.append((m.start(), m.end()))
    return spans


def _overlaps(a_start, a_end, spans):
    for s, e in spans:
        if a_start < e and s < a_end:
            return True
    return False


def _apply_pass(source, text, omap, repls, edits, protected):
    """Применить замены одного прохода. Вернуть (новый_текст, новый_omap).

    Мутирует `edits`: сдвигает существующие и дописывает новые (с исходными
    координатами из omap).
    """
    # Отсекаем замены в защищённых диапазонах и разрешаем пересечения внутри
    # прохода (оставляем левую).
    repls = [r for r in repls if not _overlaps(r.start, r.end, protected)]
    repls.sort(key=lambda r: (r.start, r.end))
    clean = []
    last_end = -1
    for r in repls:
        if r.start >= last_end:
            clean.append(r)
            last_end = r.end
    repls = clean
    if not repls:
        return text, omap

    n = len(text)
    src_len = len(source)
    parts = []
    new_omap = []
    cursor = 0
    delta = 0
    new_edits = []
    for r in repls:
        parts.append(text[cursor:r.start])
        new_omap.extend(omap[cursor:r.start])

        orig_start = omap[r.start] if r.start < n else src_len
        orig_end = omap[r.end] if r.end < n else src_len

        parts.append(r.new)
        new_omap.extend([orig_start] * len(r.new))

        final_start = r.start + delta
        delta += len(r.new) - (r.end - r.start)
        final_end = final_start + len(r.new)
        new_edits.append(Edit(
            start=final_start, end=final_end,
            original=source[orig_start:orig_end], new=r.new,
            rule_type=r.rule_type, rule=r.rule, message=r.message, lang=r.lang,
            osrc_start=orig_start, osrc_end=orig_end))
        cursor = r.end
    parts.append(text[cursor:])
    new_omap.extend(omap[cursor:])
    new_text = "".join(parts)

    # Сдвигаем ранее записанные правки на дельту замен, лежащих левее.
    for ed in edits:
        d = 0
        for r in repls:
            if r.end <= ed.start:
                d += len(r.new) - (r.end - r.start)
        ed.shift(d)

    edits.extend(new_edits)
    return new_text, new_omap


def _merge_overlaps(edits, source, final_text):
    """Слить пересекающиеся по итоговым координатам правки в одну."""
    edits.sort(key=lambda e: (e.start, e.end))
    merged = []
    for ed in edits:
        if merged and ed.start < merged[-1].end:  # строгое пересечение
            m = merged[-1]
            m.end = max(m.end, ed.end)
            m.osrc_start = min(m.osrc_start, ed.osrc_start)
            m.osrc_end = max(m.osrc_end, ed.osrc_end)
            # Главный тип — с наибольшим приоритетом.
            if _TYPE_PRIORITY.get(ed.rule_type, 0) > _TYPE_PRIORITY.get(m.rule_type, 0):
                m.rule_type = ed.rule_type
                m.rule = ed.rule
                m.lang = ed.lang
            if ed.message not in m.message:
                m.message = m.message + " + " + ed.message
        else:
            merged.append(ed)
    # Пересчитываем текст правок по итоговым/исходным координатам.
    for m in merged:
        m.original = source[m.osrc_start:m.osrc_end]
        m.new = final_text[m.start:m.end]
    return merged


class Typographer:
    """Применяет типографские правила к тексту.

    Параметры
    ---------
    enabled_types : какие типы правок применять ('quotes'/'dashes'/'nbsp').
    en_dash_style : 'us' (em dash без пробелов) | 'uk' (en dash с пробелами).
    exceptions    : список слов/фрагментов, которые нельзя менять.
    default_lang  : язык по умолчанию для нейтральных фрагментов.
    """

    def __init__(self, enabled_types=None, en_dash_style="us",
                 exceptions=None, default_lang="ru"):
        self.enabled_types = set(
            enabled_types if enabled_types is not None else DEFAULT_ENABLED)
        self.en_dash_style = en_dash_style if en_dash_style in ("us", "uk") else "us"
        self.exceptions = exceptions or []
        self.default_lang = default_lang

    def process(self, text):
        """Вернуть (итоговый_текст, [Edit, ...])."""
        source = text
        omap = list(range(len(text)))  # char i → позиция в исходном тексте
        edits = []
        for rule in REGISTRY:
            if not rule.enabled_for(self.enabled_types):
                continue
            ctx = RuleContext(
                lang=LangResolver(text, default=self.default_lang),
                en_dash_style=self.en_dash_style,
                options={},
            )
            protected = _protected_spans(text, self.exceptions)
            repls = rule.find(text, ctx)
            if repls:
                text, omap = _apply_pass(source, text, omap, repls, edits, protected)

        edits = _merge_overlaps(edits, source, text)
        for idx, ed in enumerate(edits):
            ed.id = idx
        return text, edits
