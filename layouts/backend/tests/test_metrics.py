"""Тесты извлечения метрик: шрифты строятся в памяти (без системных зависимостей)."""

import io

import pytest
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

from fontmetrics import FontMetricsError, compute_metrics


def _rect_glyph(x0, y0, x1, y1):
    pen = TTGlyphPen(None)
    pen.moveTo((x0, y0))
    pen.lineTo((x0, y1))
    pen.lineTo((x1, y1))
    pen.lineTo((x1, y0))
    pen.closePath()
    return pen.glyph()


def _empty_glyph():
    return TTGlyphPen(None).glyph()


def _build_ttf(upm=1000, cap=700, xh=500, os2_version=4, with_heights=True):
    """Минимальный валидный TTF: глиф H высотой `cap`, глиф x высотой `xh`."""
    order = [".notdef", "H", "x", "space"]
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({ord("H"): "H", ord("x"): "x", ord(" "): "space"})
    fb.setupGlyf({
        ".notdef": _empty_glyph(),
        "H": _rect_glyph(100, 0, 500, cap),
        "x": _rect_glyph(100, 0, 400, xh),
        "space": _empty_glyph(),
    })
    fb.setupHorizontalMetrics({g: (600, 50) for g in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200, lineGap=0)
    fb.setupNameTable({"familyName": "TestFont", "styleName": "Regular"})
    os2_kwargs = dict(version=os2_version, sTypoAscender=800,
                      sTypoDescender=-200, sTypoLineGap=0, xAvgCharWidth=550)
    if with_heights and os2_version >= 2:
        os2_kwargs.update(sCapHeight=cap, sxHeight=xh)
    fb.setupOS2(**os2_kwargs)
    fb.setupPost()
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()


def test_reads_os2_heights():
    data = _build_ttf(cap=700, xh=500, os2_version=4, with_heights=True)
    m = compute_metrics(data)
    assert m["unitsPerEm"] == 1000
    assert m["capHeight"] == 700
    assert m["capHeightSource"] == "os2"
    assert m["xHeight"] == 500
    assert m["xHeightSource"] == "os2"
    assert m["ascent"] == 800
    assert m["descent"] == -200
    assert m["family"] == "TestFont"
    assert m["hasCyrillic"] is False
    assert m["cyrillicCoverage"] == 0
    assert len(m["sha256"]) == 64


def test_geometric_fallback_when_os2_lacks_heights():
    # OS/2 v1 не хранит sCapHeight/sxHeight → значения меряются по контурам H/x.
    data = _build_ttf(cap=680, xh=480, os2_version=1)
    m = compute_metrics(data)
    assert m["capHeight"] == 680
    assert m["capHeightSource"] == "geometric"
    assert m["xHeight"] == 480
    assert m["xHeightSource"] == "geometric"


def test_same_bytes_same_hash():
    data = _build_ttf()
    assert compute_metrics(data)["sha256"] == compute_metrics(data)["sha256"]


def test_rejects_garbage():
    with pytest.raises(FontMetricsError):
        compute_metrics(b"this is definitely not a font file")
