"""Конфигурация бэкенда конвертера (читается из переменных окружения)."""
import os


class Config:
    # Хост/порт Flask.
    # Порт 5060, а не 5000: на macOS 5000 занят Control Center (AirPlay).
    # 5050 и 5001 заняты соседними модулями (typograph / spellcheck).
    HOST = os.environ.get("HOST", "127.0.0.1")
    PORT = int(os.environ.get("PORT", "5060"))

    # Лимит на один файл (байт). Шрифты редко больше пары мегабайт;
    # вариативные и CJK — крупнее, поэтому по умолчанию 30 МБ.
    MAX_FILE_SIZE = int(os.environ.get("MAX_FILE_SIZE", str(30 * 1024 * 1024)))

    # Лимит на суммарный размер запроса (пакетная загрузка).
    MAX_CONTENT_LENGTH = int(
        os.environ.get("MAX_CONTENT_LENGTH", str(200 * 1024 * 1024))
    )

    # Максимум файлов за один пакет — защита синхронной обработки от перегруза.
    MAX_FILES = int(os.environ.get("MAX_FILES", "50"))
