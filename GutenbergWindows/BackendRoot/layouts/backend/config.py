"""Конфигурация тонкого сервиса метрик (читается из переменных окружения)."""
import os


class Config:
    # Хост/порт Flask.
    # Порт 5070: 5060/5050/5001 заняты соседними модулями
    # (converter/typograph/spellcheck), 5000 и 7000 — AirPlay на macOS.
    HOST = os.environ.get("HOST", "127.0.0.1")
    PORT = int(os.environ.get("PORT", "5070"))

    # Лимит на один файл шрифта (байт). Обычные шрифты — пара МБ,
    # CJK/вариативные крупнее, поэтому по умолчанию 30 МБ.
    MAX_FILE_SIZE = int(os.environ.get("MAX_FILE_SIZE", str(30 * 1024 * 1024)))
    MAX_CONTENT_LENGTH = MAX_FILE_SIZE + 1024 * 1024

    # Сколько распарсенных шрифтов держать в памяти (LRU-кэш по SHA-256).
    CACHE_SIZE = int(os.environ.get("CACHE_SIZE", "128"))

    # Допустимые расширения (fontTools читает все эти форматы; woff2 — через brotli).
    ALLOWED_EXT = {".otf", ".ttf", ".woff", ".woff2", ".ttc"}
