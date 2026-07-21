"""Конфигурация бэкенда (читается из переменных окружения)."""
import os


class Config:
    # Адрес LanguageTool. По умолчанию — ОНЛАЙН-сервис: ничего ставить не нужно
    # (ни Docker, ни Java), «словарь» подгружается онлайн, нужен только интернет.
    # Для приватной/офлайн-проверки укажите свой сервер, напр. http://localhost:8010.
    LT_URL = os.environ.get("LT_URL", "https://api.languagetool.org")

    # Таймаут запроса к LanguageTool, сек.
    LT_TIMEOUT = float(os.environ.get("LT_TIMEOUT", "20"))

    # Файл пользовательского словаря (слова-исключения).
    DICT_PATH = os.environ.get(
        "DICT_PATH",
        os.path.join(os.path.dirname(__file__), "user_dictionary.json"),
    )

    # Хост/порт Flask.
    # Порт 5001, а не 5000: на macOS порт 5000 занят Control Center (AirPlay
    # Receiver), из-за чего запросы к Flask перехватываются и возвращают 404.
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = int(os.environ.get("PORT", "5001"))

    # Максимальная длина проверяемого текста (символов), защита от слишком больших запросов.
    MAX_TEXT_LEN = int(os.environ.get("MAX_TEXT_LEN", "40000"))
