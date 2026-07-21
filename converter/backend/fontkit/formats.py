"""Определение формата исходного шрифта и конвертация в целевой формат.

Модель форматов
---------------
Формат = (контейнер, тип контуров):

    OTF   = sfnt  + CFF   (кубические кривые)
    TTF   = sfnt  + glyf  (квадратичные кривые)
    WOFF  = woff  + любые (сжатая обёртка вокруг sfnt)
    WOFF2 = woff2 + любые (обёртка с лучшим сжатием, нужен brotli)

Ключевой принцип: WOFF/WOFF2 — это контейнеры. При конвертации в них тип
контуров СОХРАНЯЕТСЯ (OTF→WOFF2 остаётся CFF, TTF→WOFF2 остаётся glyf).
Смена типа контуров происходит только при цели OTF или TTF (см. outlines.py).
"""

from __future__ import annotations

import io

from fontTools.ttLib import TTFont

from .outlines import otf_to_ttf, ttf_to_otf


# Метаданные целевых форматов — отдаются фронтенду для чекбоксов.
TARGET_FORMATS = [
    {"key": "otf", "label": "OTF", "ext": "otf", "container": "sfnt",
     "outline": "cff",
     "note": "OpenType/CFF — десктоп, печать, вектор без потерь"},
    {"key": "ttf", "label": "TTF", "ext": "ttf", "container": "sfnt",
     "outline": "glyf",
     "note": "TrueType — десктоп, Windows, Android"},
    {"key": "woff", "label": "WOFF", "ext": "woff", "container": "woff",
     "outline": "keep",
     "note": "Веб-шрифт, максимальная совместимость браузеров"},
    {"key": "woff2", "label": "WOFF2", "ext": "woff2", "container": "woff2",
     "outline": "keep",
     "note": "Веб-шрифт, лучшее сжатие (нужен brotli)"},
]

_TARGETS_BY_KEY = {f["key"]: f for f in TARGET_FORMATS}


class FontLoadError(Exception):
    """Не удалось прочитать файл как шрифт (битый файл, TTC, нет brotli и т.п.)."""


def brotli_available() -> bool:
    try:
        import brotli  # noqa: F401
        return True
    except ImportError:
        return False


def load_font(data: bytes) -> TTFont:
    """Прочитать шрифт из байтов. Бросает FontLoadError с понятным текстом."""
    sig = data[:4]
    if sig == b"ttcf":
        raise FontLoadError(
            "Коллекции шрифтов (TTC/OTC) не поддерживаются — "
            "разберите на отдельные шрифты"
        )
    if sig == b"wOF2" and not brotli_available():
        raise FontLoadError("Для чтения WOFF2 нужен пакет brotli")
    if sig not in (b"wOFF", b"wOF2", b"OTTO", b"true", b"typ1",
                   b"\x00\x01\x00\x00"):
        raise FontLoadError("Файл не распознан как шрифт (OTF/TTF/WOFF/WOFF2)")
    try:
        return TTFont(io.BytesIO(data), fontNumber=0, lazy=False)
    except FontLoadError:
        raise
    except Exception as exc:  # noqa: BLE001 — битый sfnt/таблица не должен ронять API
        # Не только TTLibError: повреждённые таблицы бросают struct.error,
        # NotImplementedError и т.п. Любую такую ошибку превращаем в понятный отказ.
        raise FontLoadError(f"Не удалось разобрать шрифт: {exc}") from exc


def outline_kind(font: TTFont) -> str:
    """'cff' для PostScript-контуров, 'glyf' для TrueType-контуров."""
    return "cff" if ("CFF " in font or "CFF2" in font) else "glyf"


def detect_format(font: TTFont) -> dict:
    """Определить формат исходного шрифта: ключ, метка, контейнер, контуры."""
    outline = outline_kind(font)
    flavor = font.flavor  # None | 'woff' | 'woff2'
    if flavor == "woff2":
        key, label, ext, container = "woff2", "WOFF2", "woff2", "woff2"
    elif flavor == "woff":
        key, label, ext, container = "woff", "WOFF", "woff", "woff"
    elif outline == "cff":
        key, label, ext, container = "otf", "OTF", "otf", "sfnt"
    else:
        key, label, ext, container = "ttf", "TTF", "ttf", "sfnt"
    return {
        "key": key,
        "label": label,
        "ext": ext,
        "container": container,
        "outline": outline,  # 'cff' | 'glyf'
    }


def convert_font(data: bytes, target_key: str) -> dict:
    """Сконвертировать шрифт (байты) в целевой формат.

    Возвращает dict:
        ok        — удалось ли,
        data      — байты результата (если ok),
        ext       — расширение файла,
        outline   — тип контуров результата ('cff'|'glyf'),
        warnings  — список предупреждений (строки),
        error     — текст ошибки (если не ok).
    """
    target = _TARGETS_BY_KEY.get(target_key)
    if target is None:
        return {"ok": False, "error": f"Неизвестный формат: {target_key}",
                "warnings": []}

    warnings: list[str] = []

    if target["container"] == "woff2" and not brotli_available():
        return {"ok": False, "error": "Для WOFF2 нужен пакет brotli",
                "warnings": warnings}

    # Каждый вызов грузит шрифт заново: otf_to_ttf мутирует объект на месте,
    # поэтому переиспользовать один TTFont между целями нельзя.
    try:
        font = load_font(data)
    except FontLoadError as exc:
        return {"ok": False, "error": str(exc), "warnings": warnings}

    current = outline_kind(font)
    # Для контейнеров WOFF/WOFF2 контуры сохраняем; для OTF/TTF — приводим.
    desired = {"cff": "cff", "glyf": "glyf", "keep": current}[target["outline"]]

    try:
        if desired != current:
            if desired == "glyf":
                otf_to_ttf(font)  # CFF → glyf (надёжно)
            else:  # desired == 'cff'
                font = ttf_to_otf(font)  # glyf → CFF (best-effort)
                warnings.append(
                    "TTF→OTF: контуры подняты из квадратичных в кубические "
                    "(best-effort). Проверьте результат — направление лишено "
                    "практического смысла и на сложных шрифтах возможны артефакты."
                )
    except Exception as exc:  # noqa: BLE001 — любая ошибка конвертации контуров
        return {
            "ok": False,
            "error": f"Ошибка конвертации контуров {current}→{desired}: {exc}",
            "warnings": warnings,
        }

    # Контейнер: flavor задаёт обёртку WOFF/WOFF2, None — «голый» sfnt.
    font.flavor = {"sfnt": None, "woff": "woff", "woff2": "woff2"}[target["container"]]

    out = io.BytesIO()
    try:
        font.save(out, reorderTables=True)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Ошибка сохранения: {exc}",
                "warnings": warnings}

    result_outline = outline_kind(font)
    return {
        "ok": True,
        "data": out.getvalue(),
        "ext": target["ext"],
        "outline": result_outline,
        "warnings": warnings,
    }
