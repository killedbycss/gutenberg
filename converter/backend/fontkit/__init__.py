"""fontkit — ядро конвертации шрифтов и анализа на базе fontTools.

Публичный API:
    analyze_font(data, preset)      — метаданные, метрики, покрытие набора.
    convert_font(data, target_key)  — конвертация в OTF/TTF/WOFF/WOFF2.
    detect_format(font)             — определить формат исходника.
    load_font(data)                 — прочитать TTFont из байтов.
    TARGET_FORMATS                  — метаданные целевых форматов для UI.
    brotli_available()              — доступно ли сжатие WOFF2.
"""

import logging

# fontTools сыплет WARNING'ами вроде «too much glyph data: N excess bytes» на
# слегка нестандартных (но рабочих) шрифтах — для API это шум, глушим до ERROR.
logging.getLogger("fontTools").setLevel(logging.ERROR)

from .charsets import DEFAULT_PRESET, PRESETS  # noqa: E402
from .formats import (
    TARGET_FORMATS,
    FontLoadError,
    brotli_available,
    convert_font,
    detect_format,
    load_font,
)
from .report import analyze_font, coverage_report, extract_metadata, extract_metrics

__all__ = [
    "analyze_font",
    "convert_font",
    "detect_format",
    "load_font",
    "coverage_report",
    "extract_metadata",
    "extract_metrics",
    "TARGET_FORMATS",
    "FontLoadError",
    "brotli_available",
    "PRESETS",
    "DEFAULT_PRESET",
]
