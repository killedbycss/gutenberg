"""Конвертация модели контуров между OTF (CFF, кубические кривые) и
TTF (glyf, квадратичные кривые).

WOFF/WOFF2 — это лишь контейнеры-обёртки, они модель контуров не меняют
(см. formats.py). А вот OTF ↔ TTF — это именно смена математики кривых:

    OTF → TTF   надёжно: кубика аппроксимируется квадратикой (cu2qu).
    TTF → OTF   best-effort: квадратика поднимается до кубики (qu2cu) и
                упаковывается в CFF. Направление редкое и по своей природе
                лишённое смысла (точность не растёт), поэтому оформлено как
                «по возможности» и не гарантируется для сложных шрифтов.
"""

from __future__ import annotations

from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen


# --- OTF → TTF -------------------------------------------------------------

def _glyphs_to_quadratic(glyph_set, max_err: float, reverse_direction: bool):
    """Перерисовать каждый глиф кубического glyphSet в квадратичный glyf-глиф."""
    quad = {}
    for name in glyph_set.keys():
        tt_pen = TTGlyphPen(glyph_set)
        cu2qu_pen = Cu2QuPen(tt_pen, max_err, reverse_direction=reverse_direction)
        glyph_set[name].draw(cu2qu_pen)
        quad[name] = tt_pen.glyph()
    return quad


def otf_to_ttf(font: TTFont, max_err: float = 1.0,
               reverse_direction: bool = True, post_format: float = 2.0) -> TTFont:
    """Преобразовать OTF (CFF) в TTF (glyf) на месте. Возвращает тот же объект.

    max_err — допустимая ошибка аппроксимации в юнитах em (1.0 при 1000 upm —
    практически незаметно). Контуры TrueType требуют обратного направления,
    поэтому reverse_direction=True.
    """
    if "glyf" in font:
        return font  # уже TrueType-контуры
    if "CFF " not in font and "CFF2" not in font:
        raise ValueError("Во входном шрифте нет ни CFF, ни glyf-контуров")

    glyph_order = font.getGlyphOrder()

    glyf = newTable("glyf")
    glyf.glyphOrder = glyph_order
    glyf.glyphs = _glyphs_to_quadratic(font.getGlyphSet(), max_err, reverse_direction)

    # loca пересоберётся при компиляции из glyf.
    font["loca"] = newTable("loca")
    font["glyf"] = glyf

    for tag in ("CFF ", "CFF2", "VORG"):
        if tag in font:
            del font[tag]

    # Границы глифов (xMin/yMin/xMax/yMax) нужны для пересчёта maxp и head.bbox,
    # но у свежесозданных через TTGlyphPen глифов их ещё нет — считаем явно.
    for glyph in glyf.glyphs.values():
        glyph.recalcBounds(glyf)

    # maxp: версия CFF (0.5) содержит только numGlyphs — дополняем полями,
    # которые обязательны для TrueType (0x00010000), иначе компиляция упадёт.
    maxp = font["maxp"]
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    maxp.maxTwilightPoints = 0
    maxp.maxStorage = 0
    maxp.maxFunctionDefs = 0
    maxp.maxInstructionDefs = 0
    maxp.maxStackElements = 0
    maxp.maxSizeOfInstructions = 0
    maxp.maxComponentElements = 0
    maxp.maxComponentDepth = 0
    # Остальные (numGlyphs, maxPoints, maxContours и производные) пересчитает
    # сам fontTools по таблице glyf.
    maxp.recalc(font)

    # post 2.0 хранит имена глифов; 3.0 из OTF их не содержит.
    if "post" in font:
        post = font["post"]
        post.formatType = post_format
        if post_format == 2.0:
            post.extraNames = []
            post.mapping = {}
            post.glyphOrder = glyph_order

    font.sfntVersion = "\x00\x01\x00\x00"  # 'true' sfnt для glyf-контуров
    return font


# --- TTF → OTF (best-effort) -----------------------------------------------

def ttf_to_otf(font: TTFont, max_err: float = 1.0) -> TTFont:
    """Преобразовать TTF (glyf) в OTF (CFF). Возвращает НОВЫЙ объект TTFont.

    Направление лишено практического смысла (квадратика уже потеряла точность
    кубики), поэтому реализовано «по возможности». Может бросить исключение на
    экзотических шрифтах — вызывающий код обязан это поймать и сообщить.
    """
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.pens.qu2cuPen import Qu2CuPen
    from fontTools.fontBuilder import FontBuilder

    if "glyf" not in font:
        return font  # уже CFF-контуры

    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    hmtx = font["hmtx"]

    charstrings: dict[str, object] = {}
    for name in glyph_order:
        width = hmtx[name][0]
        t2_pen = T2CharStringPen(width, glyph_set)
        qu2cu_pen = Qu2CuPen(t2_pen, max_err, reverse_direction=True)
        glyph_set[name].draw(qu2cu_pen)
        charstrings[name] = t2_pen.getCharString()

    upm = font["head"].unitsPerEm
    ps_name = font["name"].getDebugName(6) or "Converted-Regular"
    ps_name = ps_name.replace(" ", "")

    # Собираем новый шрифт с CFF-таблицей, переносим существующие таблицы.
    fb = FontBuilder(upm, isTTF=False)
    fb.setupGlyphOrder(glyph_order)
    # cmap: восстановим из лучшего Unicode-подмножества исходника.
    cmap = font.getBestCmap() or {}
    fb.setupCharacterMap(cmap)
    fb.setupCFF(ps_name, {"FullName": ps_name}, charstrings, {})

    metrics = {name: (hmtx[name][0], hmtx[name][1]) for name in glyph_order}
    fb.setupHorizontalMetrics(metrics)

    hhea = font["hhea"]
    fb.setupHorizontalHeader(
        ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap
    )

    # name: переносим строки исходника (семейство, автор, версия и т.д.).
    name_strings = {}
    for rec in font["name"].names:
        try:
            name_strings.setdefault(rec.nameID, rec.toUnicode())
        except UnicodeDecodeError:
            continue
    fb.setupNameTable({_NAME_KEYS.get(k, f"nameID{k}"): v
                       for k, v in name_strings.items() if k in _NAME_KEYS})

    # OS/2 и post переносим из исходника, если есть, — иначе FontBuilder создаст
    # разумные значения по умолчанию.
    fb.setupOS2()
    fb.setupPost()
    for tag in ("OS/2", "post"):
        if tag in font:
            fb.font[tag] = font[tag]

    return fb.font


# nameID → ключ FontBuilder.setupNameTable
_NAME_KEYS = {
    0: "copyright",
    1: "familyName",
    2: "styleName",
    3: "uniqueFontIdentifier",
    4: "fullName",
    5: "version",
    6: "psName",
    7: "trademark",
    8: "manufacturer",
    9: "designer",
    11: "vendorURL",
    12: "designerURL",
    13: "licenseDescription",
    14: "licenseInfoURL",
}
