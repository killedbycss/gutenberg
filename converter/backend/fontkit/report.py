"""Извлечение метаданных, метрик и отчёта о полноте набора символов."""

from __future__ import annotations

import unicodedata

from fontTools.ttLib import TTFont

from . import charsets
from .formats import FontLoadError, detect_format, load_font


# --- Метаданные (name-таблица + лицензия) ----------------------------------

# nameID → ключ в ответе. Порядок предпочтения (typographic → базовый) задаётся
# списком: берётся первый доступный.
_NAME_FIELDS = {
    "family": (16, 1),
    "subfamily": (17, 2),
    "fullName": (4,),
    "postscriptName": (6,),
    "version": (5,),
    "copyright": (0,),
    "trademark": (7,),
    "manufacturer": (8,),
    "designer": (9,),
    "vendorURL": (11,),
    "licenseDescription": (13,),
    "licenseURL": (14,),
}


def _first_name(name_table, ids) -> str | None:
    for nid in ids:
        value = name_table.getDebugName(nid)
        if value:
            return value.strip()
    return None


def _decode_fstype(value: int) -> dict:
    """Расшифровать биты fsType (разрешения на встраивание) в человекочитаемый вид."""
    if value == 0:
        return {
            "value": 0,
            "restricted": False,
            "labels": ["Installable — встраивание без ограничений"],
        }
    labels: list[str] = []
    if value & 0x0002:
        labels.append("Restricted License — встраивание запрещено")
    if value & 0x0004:
        labels.append("Preview & Print — только просмотр и печать")
    if value & 0x0008:
        labels.append("Editable — встраивание для редактирования разрешено")
    if value & 0x0100:
        labels.append("No subsetting — сабсеттинг запрещён")
    if value & 0x0200:
        labels.append("Bitmap embedding only — только растровое встраивание")
    if not labels:
        labels.append(f"fsType = 0x{value:04X}")
    return {"value": value, "restricted": bool(value & 0x0002), "labels": labels}


def extract_metadata(font: TTFont) -> dict:
    meta: dict = {}
    if "name" in font:
        name_table = font["name"]
        for key, ids in _NAME_FIELDS.items():
            meta[key] = _first_name(name_table, ids)
    if "OS/2" in font:
        meta["fsType"] = _decode_fstype(font["OS/2"].fsType)
    else:
        meta["fsType"] = None
    return meta


# --- Метрики ---------------------------------------------------------------

def extract_metrics(font: TTFont) -> dict:
    head = font["head"] if "head" in font else None
    hhea = font["hhea"] if "hhea" in font else None
    os2 = font["OS/2"] if "OS/2" in font else None
    post = font["post"] if "post" in font else None

    try:
        encoded = len(font.getBestCmap() or {})
    except Exception:  # noqa: BLE001
        encoded = 0

    metrics: dict = {
        "unitsPerEm": head.unitsPerEm if head else None,
        "glyphCount": font["maxp"].numGlyphs if "maxp" in font else None,
        "encodedCount": encoded,
        "bounds": None,
        "styleFlags": None,
        "weightClass": os2.usWeightClass if os2 else None,
        "widthClass": os2.usWidthClass if os2 else None,
        "vertical": {},
        "underline": None,
        "italicAngle": post.italicAngle if post else None,
        "isFixedPitch": bool(post.isFixedPitch) if post else None,
    }

    if head:
        metrics["bounds"] = {
            "xMin": head.xMin, "yMin": head.yMin,
            "xMax": head.xMax, "yMax": head.yMax,
        }
        metrics["styleFlags"] = {
            "bold": bool(head.macStyle & 0x01),
            "italic": bool(head.macStyle & 0x02),
        }
    if hhea:
        metrics["vertical"].update({
            "ascent": hhea.ascent,
            "descent": hhea.descent,
            "lineGap": hhea.lineGap,
            "advanceWidthMax": hhea.advanceWidthMax,
        })
    if os2:
        metrics["vertical"].update({
            "typoAscender": os2.sTypoAscender,
            "typoDescender": os2.sTypoDescender,
            "typoLineGap": os2.sTypoLineGap,
            "winAscent": os2.usWinAscent,
            "winDescent": os2.usWinDescent,
        })
        # sxHeight/sCapHeight появились в OS/2 версии 2.
        if getattr(os2, "version", 0) >= 2:
            metrics["vertical"]["xHeight"] = getattr(os2, "sxHeight", None)
            metrics["vertical"]["capHeight"] = getattr(os2, "sCapHeight", None)
    if post:
        metrics["underline"] = {
            "position": post.underlinePosition,
            "thickness": post.underlineThickness,
        }
    return metrics


# --- Покрытие набора символов ----------------------------------------------

def _char_display(cp: int) -> str:
    """Символ для показа; для невидимых (напр. NBSP) — пустая строка."""
    ch = chr(cp)
    category = unicodedata.category(ch)
    if category.startswith("C") or category in ("Zs", "Zl", "Zp"):
        return ""
    return ch


def coverage_report(font: TTFont, preset: str = charsets.DEFAULT_PRESET,
                    missing_limit: int = 500) -> dict:
    try:
        cmap = font.getBestCmap() or {}
    except Exception:  # noqa: BLE001
        cmap = {}

    categories = []
    total_all = present_all = 0
    for key, label, codepoints in charsets.get_preset(preset):
        missing = sorted(cp for cp in codepoints if cp not in cmap)
        present = len(codepoints) - len(missing)
        total_all += len(codepoints)
        present_all += present
        missing_details = [
            {
                "cp": f"U+{cp:04X}",
                "char": _char_display(cp),
                "name": unicodedata.name(chr(cp), "").title() or None,
            }
            for cp in missing[:missing_limit]
        ]
        categories.append({
            "key": key,
            "label": label,
            "total": len(codepoints),
            "present": present,
            "missing": len(missing),
            # floor, а не round: «100 %» показываем только при полном покрытии.
            "coverage": int(present / len(codepoints) * 100) if codepoints else 100,
            "missingGlyphs": missing_details,
            "missingTruncated": len(missing) > missing_limit,
        })

    return {
        "preset": preset,
        "total": total_all,
        "present": present_all,
        "missing": total_all - present_all,
        "coverage": int(present_all / total_all * 100) if total_all else 100,
        "complete": present_all == total_all,
        "categories": categories,
    }


# --- Оркестратор -----------------------------------------------------------

def analyze_font(data: bytes, preset: str = charsets.DEFAULT_PRESET) -> dict:
    """Полный отчёт по одному шрифту (для ответа /api/analyze)."""
    try:
        font = load_font(data)
    except FontLoadError as exc:
        return {"ok": False, "error": str(exc)}

    try:
        return {
            "ok": True,
            "source": detect_format(font),
            "metadata": extract_metadata(font),
            "metrics": extract_metrics(font),
            "coverage": coverage_report(font, preset),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Ошибка анализа шрифта: {exc}"}
    finally:
        font.close()
