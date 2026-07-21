"""Извлечение типографских метрик шрифта для подбора макета.

Тонкий модуль: принимает байты шрифта (OTF/TTF/WOFF/WOFF2/TTC) и возвращает
словарь метрик, на которых фронтенд строит макет (кегли, поля, интерлиньяж).

cap-height / x-height берутся из таблицы OS/2 (версии ≥ 2). Если их там нет
(частый случай у старых или самодельных шрифтов) — они измеряются геометрически
по верхней границе контуров глифов «H» и «x». Источник каждой метрики помечается
полем *Source ("os2" | "geometric" | "fallback"), чтобы фронтенд понимал,
насколько ей можно доверять.
"""

from __future__ import annotations

import hashlib
import io

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont, TTLibError


class FontMetricsError(Exception):
    """Шрифт не удалось прочитать или в нём нет обязательных таблиц."""


def _glyph_top(glyph_set, cmap, char: str):
    """Верхняя граница (yMax) контура глифа символа `char` в единицах em.

    None, если глифа нет, он пустой (напр. пробел) или контур не читается.
    """
    name = cmap.get(ord(char))
    if not name or name not in glyph_set:
        return None
    pen = BoundsPen(glyph_set)
    try:
        glyph_set[name].draw(pen)
    except Exception:  # noqa: BLE001 — битый контур не должен ронять сервис
        return None
    if pen.bounds is None:
        return None
    return pen.bounds[3]  # (xMin, yMin, xMax, yMax) → yMax


def _round(value):
    """Округлить до целого, сохранив None и знак (для descent)."""
    return None if value is None else int(round(value))


def compute_metrics(data: bytes) -> dict:
    """Разобрать шрифт и вернуть словарь метрик. Бросает FontMetricsError."""
    sha256 = hashlib.sha256(data).hexdigest()
    try:
        font = TTFont(io.BytesIO(data), fontNumber=0, lazy=True)
    except TTLibError as exc:
        raise FontMetricsError(f"Не удалось прочитать шрифт: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 — brotli/woff2 и пр. кидают своё
        raise FontMetricsError(f"Не удалось прочитать шрифт: {exc}") from exc

    head = font["head"] if "head" in font else None
    hhea = font["hhea"] if "hhea" in font else None
    os2 = font["OS/2"] if "OS/2" in font else None
    post = font["post"] if "post" in font else None
    name = font["name"] if "name" in font else None

    if head is None or not getattr(head, "unitsPerEm", 0):
        raise FontMetricsError("В шрифте нет корректной таблицы head")

    units_per_em = head.unitsPerEm

    # --- Вертикальные метрики строки (hhea) ---
    ascent = hhea.ascent if hhea else None
    descent = hhea.descent if hhea else None  # обычно отрицательный
    line_gap = hhea.lineGap if hhea else 0

    # --- OS/2: типографские метрики, класс насыщенности, ширина знака ---
    typo_ascender = typo_descender = typo_line_gap = None
    weight_class = width_class = avg_char_width = None
    cap_height = x_height = None
    cap_source = x_source = None
    if os2 is not None:
        typo_ascender = os2.sTypoAscender
        typo_descender = os2.sTypoDescender
        typo_line_gap = os2.sTypoLineGap
        weight_class = os2.usWeightClass
        width_class = os2.usWidthClass
        avg_char_width = getattr(os2, "xAvgCharWidth", None)
        if getattr(os2, "version", 0) >= 2:
            cap_height = getattr(os2, "sCapHeight", None) or None
            x_height = getattr(os2, "sxHeight", None) or None
            cap_source = "os2" if cap_height else None
            x_source = "os2" if x_height else None

    # --- Покрытие письменностей и геометрический fallback по контурам «H» / «x» ---
    cmap = {}
    try:
        cmap = font.getBestCmap() or {}
    except Exception:  # noqa: BLE001
        pass
    # Проверяем не единичную букву, а базовый набор — так случайный символ в
    # декоративном шрифте не будет ошибочно считаться поддержкой кириллицы.
    cyrillic_probe = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЭЮЯабвгдежзийклмнопрстуфхцчшщыэюя"
    cyrillic_count = sum(ord(char) in cmap for char in cyrillic_probe)
    has_cyrillic = cyrillic_count >= int(len(cyrillic_probe) * 0.8)

    if cap_height is None or x_height is None:
        try:
            glyph_set = font.getGlyphSet()
        except Exception:  # noqa: BLE001
            cmap, glyph_set = {}, None
        if glyph_set is not None:
            if cap_height is None:
                top = _glyph_top(glyph_set, cmap, "H")
                if top:
                    cap_height, cap_source = top, "geometric"
            if x_height is None:
                top = _glyph_top(glyph_set, cmap, "x")
                if top:
                    x_height, x_source = top, "geometric"

    # --- Последний рубеж: типовые доли от em, чтобы движок не делил на None ---
    if cap_height is None:
        cap_height, cap_source = round(units_per_em * 0.7), "fallback"
    if x_height is None:
        x_height, x_source = round(units_per_em * 0.5), "fallback"

    family = subfamily = full_name = None
    if name is not None:
        family = name.getDebugName(16) or name.getDebugName(1)
        subfamily = name.getDebugName(17) or name.getDebugName(2)
        full_name = name.getDebugName(4)

    return {
        "sha256": sha256,
        "family": family,
        "subfamily": subfamily,
        "fullName": full_name,
        "unitsPerEm": units_per_em,
        "capHeight": _round(cap_height),
        "capHeightSource": cap_source,
        "xHeight": _round(x_height),
        "xHeightSource": x_source,
        "ascent": _round(ascent),
        "descent": _round(descent),
        "lineGap": _round(line_gap),
        "typoAscender": _round(typo_ascender),
        "typoDescender": _round(typo_descender),
        "typoLineGap": _round(typo_line_gap),
        "weightClass": weight_class,
        "widthClass": width_class,
        "avgCharWidth": _round(avg_char_width),
        "hasCyrillic": has_cyrillic,
        "cyrillicCoverage": round(cyrillic_count / len(cyrillic_probe), 3),
        "italicAngle": float(post.italicAngle) if post else None,
        "isItalic": bool(head.macStyle & 0x02),
    }
