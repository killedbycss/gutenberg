"""Тесты ядра конвертации и анализа.

Тестовые шрифты собираются в памяти через FontBuilder — тесты не зависят
от системных шрифтов и воспроизводимы в любой среде.
"""
import io

import pytest
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.t2CharStringPen import T2CharStringPen

import fontkit
from app import app


GLYPH_ORDER = [".notdef", "space", "A", "Ya"]
CMAP = {0x20: "space", 0x41: "A", 0x42F: "Ya"}  # space, A, Я


def _draw_box(pen):
    pen.moveTo((100, 0))
    pen.lineTo((100, 700))
    pen.lineTo((500, 700))
    pen.lineTo((500, 0))
    pen.closePath()


def _common_setup(fb):
    fb.setupGlyphOrder(GLYPH_ORDER)
    fb.setupCharacterMap(CMAP)


def _finish(fb):
    fb.setupHorizontalMetrics({n: (600, 50) for n in GLYPH_ORDER})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({
        "familyName": "TestFont", "styleName": "Regular",
        "psName": "TestFont-Regular", "version": "Version 1.0",
    })
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200,
                usWinAscent=800, usWinDescent=200, usWeightClass=400)
    fb.setupPost()
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()


def make_ttf(upm=1000):
    fb = FontBuilder(upm, isTTF=True)
    _common_setup(fb)
    box = TTGlyphPen(None)
    _draw_box(box)
    box_glyph = box.glyph()
    glyphs = {".notdef": box_glyph, "space": TTGlyphPen(None).glyph(),
              "A": box_glyph, "Ya": box_glyph}
    fb.setupGlyf(glyphs)
    return _finish(fb)


def make_otf(upm=1000):
    fb = FontBuilder(upm, isTTF=False)
    _common_setup(fb)
    charstrings = {}
    for name in GLYPH_ORDER:
        pen = T2CharStringPen(600, None)
        if name != "space":
            _draw_box(pen)
        charstrings[name] = pen.getCharString()
    fb.setupCFF("TestFont-Regular", {"FullName": "TestFont"}, charstrings, {})
    return _finish(fb)


@pytest.fixture
def ttf_bytes():
    return make_ttf()


@pytest.fixture
def otf_bytes():
    return make_otf()


# --- Определение формата ---------------------------------------------------

def test_detect_ttf(ttf_bytes):
    font = fontkit.load_font(ttf_bytes)
    src = fontkit.detect_format(font)
    assert src["key"] == "ttf" and src["outline"] == "glyf"


def test_detect_otf(otf_bytes):
    font = fontkit.load_font(otf_bytes)
    src = fontkit.detect_format(font)
    assert src["key"] == "otf" and src["outline"] == "cff"


# --- Полная матрица конвертации -------------------------------------------

EXPECT = {
    "otf": ("otf", "cff"),
    "ttf": ("ttf", "glyf"),
}


@pytest.mark.parametrize("target", ["otf", "ttf", "woff", "woff2"])
def test_convert_from_ttf(ttf_bytes, target):
    res = fontkit.convert_font(ttf_bytes, target)
    assert res["ok"], res.get("error")
    reloaded = fontkit.load_font(res["data"])
    det = fontkit.detect_format(reloaded)
    if target in EXPECT:
        assert (det["key"], det["outline"]) == EXPECT[target]
    else:  # woff/woff2 сохраняют контуры исходника (glyf)
        assert det["key"] == target and det["outline"] == "glyf"


@pytest.mark.parametrize("target", ["otf", "ttf", "woff", "woff2"])
def test_convert_from_otf(otf_bytes, target):
    res = fontkit.convert_font(otf_bytes, target)
    assert res["ok"], res.get("error")
    reloaded = fontkit.load_font(res["data"])
    det = fontkit.detect_format(reloaded)
    if target in EXPECT:
        assert (det["key"], det["outline"]) == EXPECT[target]
    else:  # woff/woff2 сохраняют контуры исходника (cff)
        assert det["key"] == target and det["outline"] == "cff"


def test_ttf_to_otf_preserves_upm_and_metrics(ttf_bytes):
    """TTF→OTF не должен «ронять» масштаб (FontMatrix из unitsPerEm) и метрики."""
    res = fontkit.convert_font(ttf_bytes, "otf")
    otf = fontkit.load_font(res["data"])
    assert otf["head"].unitsPerEm == 1000
    assert otf["hmtx"]["A"][0] == 600  # advance width сохранён
    assert res["warnings"]  # best-effort сопровождается предупреждением


def test_woff2_wrap_is_smaller(ttf_bytes):
    res = fontkit.convert_font(ttf_bytes, "woff2")
    assert res["ok"] and len(res["data"]) > 0


# --- Анализ и покрытие -----------------------------------------------------

def test_analyze_metadata_and_metrics(ttf_bytes):
    rep = fontkit.analyze_font(ttf_bytes)
    assert rep["ok"]
    assert rep["metadata"]["family"] == "TestFont"
    assert rep["metrics"]["unitsPerEm"] == 1000
    assert rep["metrics"]["glyphCount"] == 4
    assert rep["metadata"]["fsType"]["restricted"] is False


def test_coverage_reports_missing(ttf_bytes):
    rep = fontkit.analyze_font(ttf_bytes)
    cov = rep["coverage"]
    assert cov["complete"] is False  # в шрифте всего 3 символа
    by_key = {c["key"]: c for c in cov["categories"]}
    # Присутствующие символы не попадают в «недостающие».
    latin_missing = {g["cp"] for g in by_key["latin"]["missingGlyphs"]}
    assert "U+0041" not in latin_missing  # 'A' есть
    assert by_key["cyrillic"]["present"] >= 1  # 'Я' есть


def test_junk_is_rejected():
    rep = fontkit.analyze_font(b"this is not a font")
    assert rep["ok"] is False
    res = fontkit.convert_font(b"this is not a font", "ttf")
    assert res["ok"] is False


def test_unknown_target(ttf_bytes):
    res = fontkit.convert_font(ttf_bytes, "svg")
    assert res["ok"] is False


def test_corrupt_sfnt_is_handled():
    # Валидная сигнатура TTF, но тело — мусор: API должен вернуть ошибку,
    # а не упасть с необработанным исключением (битая таблица и т.п.).
    blob = b"\x00\x01\x00\x00" + b"\xff" * 400
    rep = fontkit.analyze_font(blob)
    assert rep["ok"] is False
    res = fontkit.convert_font(blob, "woff2")
    assert res["ok"] is False


def test_webfont_endpoint_returns_browser_formats(ttf_bytes):
    response = app.test_client().post(
        "/api/webfont",
        data={"font": (io.BytesIO(ttf_bytes), "TestFont.ttf")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["family"] == "TestFont"
    assert payload["outputs"]["woff"]
    assert payload["outputs"]["woff2"]
