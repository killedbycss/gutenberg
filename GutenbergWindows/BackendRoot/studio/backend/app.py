"""Единый сервер Студии — объединяет три модуля в одном процессе на одном порту.

Архитектура
-----------
Три существующих бэкенда (spellcheck / typograph / converter) НЕ переписываются
и НЕ дублируются. Каждый импортируется «как есть» и монтируется как отдельное
WSGI-приложение под своим префиксом через DispatcherMiddleware:

    /spellcheck/api/...   → spellcheck/backend/app.py
    /typograph/api/...    → typograph/backend/app.py
    /converter/api/...    → converter/backend/app.py

Всё остальное обслуживает «оболочка» (shell_app):

    /                     → studio/shell/index.html  (верхние вкладки + iframe)
    /app/<модуль>/...     → studio/build/<модуль>/... (собранный фронтенд модуля)

Загрузчик _load_app импортирует каждый app.py под уникальным именем и после
импорта убирает из sys.modules локальные модули этого бэкенда (config, fontkit,
typography, …). Иначе одноимённые модули (у spellcheck и converter оба есть
config.py) перетёрли бы друг друга. Ссылки внутри уже собранных приложений
привязываются на этапе импорта, поэтому такая очистка безопасна.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import threading

from flask import Flask, abort, send_from_directory
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from werkzeug.serving import make_server

# --- Пути -------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))     # studio/backend
STUDIO = os.path.dirname(HERE)                         # studio
ROOT = os.path.dirname(STUDIO)                         # fonts (корень воркспейса)
BUILD_DIR = os.path.join(STUDIO, "build")
SHELL_DIR = os.path.join(STUDIO, "shell")

# Имя модуля → каталог его бэкенда. Имя используется и в URL-префиксе.
MODULES = {
    "spellcheck": os.path.join(ROOT, "spellcheck", "backend"),
    "typograph": os.path.join(ROOT, "typograph", "backend"),
    "converter": os.path.join(ROOT, "converter", "backend"),
    "layouts": os.path.join(ROOT, "layouts", "backend"),
}


# --- Загрузчик бэкендов -----------------------------------------------------

def _load_app(backend_dir: str, unique_name: str) -> Flask:
    """Импортировать `app.py` из каталога бэкенда как WSGI-приложение Flask.

    После импорта удаляет из sys.modules модули, чей файл лежит внутри
    `backend_dir` (локальные config/fontkit/typography/…), чтобы следующий
    бэкенд импортировал свои одноимённые модули заново, а не чужие.
    """
    backend_dir = os.path.abspath(backend_dir)
    app_py = os.path.join(backend_dir, "app.py")
    if not os.path.isfile(app_py):
        raise FileNotFoundError(f"Не найден бэкенд: {app_py}")

    before = set(sys.modules)
    sys.path.insert(0, backend_dir)
    try:
        spec = importlib.util.spec_from_file_location(unique_name, app_py)
        module = importlib.util.module_from_spec(spec)
        sys.modules[unique_name] = module
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        flask_app = getattr(module, "app", None)
        if flask_app is None:
            raise AttributeError(f"{app_py}: не найден объект `app` (Flask)")
        return flask_app
    finally:
        try:
            sys.path.remove(backend_dir)
        except ValueError:
            pass
        # Чистим только локальные модули этого бэкенда; сторонние (flask,
        # fonttools и т.п.) оставляем в кеше, чтобы не переисполнять их.
        for name in set(sys.modules) - before:
            if name == unique_name:
                continue
            mod = sys.modules.get(name)
            mod_file = getattr(mod, "__file__", None)
            if mod_file and os.path.abspath(mod_file).startswith(backend_dir + os.sep):
                del sys.modules[name]


# --- Оболочка: статика + собранные фронтенды --------------------------------

shell_app = Flask(__name__, static_folder=None)


@shell_app.get("/")
def index():
    return send_from_directory(SHELL_DIR, "index.html")


@shell_app.get("/healthz")
def healthz():
    """Живость самой Студии (не путать с /<модуль>/api/health)."""
    return {"status": "ok", "modules": sorted(MODULES)}


@shell_app.get("/assets/<path:filename>")
def shell_asset(filename: str):
    return send_from_directory(os.path.join(SHELL_DIR, "assets"), filename)


@shell_app.get("/favicon.ico")
def favicon():
    return send_from_directory(os.path.join(SHELL_DIR, "assets"), "favicon.ico", mimetype="image/x-icon")


@shell_app.get("/app/<name>/")
def module_index(name: str):
    if name not in MODULES:
        abort(404)
    return send_from_directory(os.path.join(BUILD_DIR, name), "index.html")


@shell_app.get("/app/<name>/<path:filename>")
def module_asset(name: str, filename: str):
    if name not in MODULES:
        abort(404)
    directory = os.path.join(BUILD_DIR, name)
    full = os.path.join(directory, filename)
    if not os.path.isfile(full):
        # SPA без клиентского роутинга — на всякий случай отдаём index.html.
        return send_from_directory(directory, "index.html")
    return send_from_directory(directory, filename)


# --- Сборка WSGI-приложения -------------------------------------------------

def build_application():
    mounts = {}
    for name, backend_dir in MODULES.items():
        mounts["/" + name] = _load_app(backend_dir, f"_mod_{name}")
    return DispatcherMiddleware(shell_app, mounts)


application = build_application()


def _serve_forever(port: int, hosts: list[str]) -> None:
    """Поднять сервер на нескольких адресах сразу.

    По умолчанию это 127.0.0.1 (IPv4) и ::1 (IPv6) — оба localhost. Так адрес
    http://localhost:PORT открывается независимо от того, во что резолвится
    localhost в конкретном браузере (частая причина «localhost не открывается»
    на macOS: сервер только на IPv4, а браузер идёт на IPv6 ::1). Остаётся
    приватным — обе петлевые, наружу не торчит.
    """
    servers = []
    for h in hosts:
        try:
            servers.append(make_server(h, port, application, threaded=True))
        except OSError as exc:
            print(f"[studio] адрес [{h}]:{port} пропущен: {exc}")
    if not servers:
        raise SystemExit(
            f"[studio] Не удалось занять порт {port}. Возможно, он уже используется "
            f"(другой запуск Студии?). Закройте его или задайте другой порт: PORT=9000."
        )
    for s in servers:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    try:
        threading.Event().wait()  # держим главный поток живым
    except KeyboardInterrupt:
        print("\n[studio] Остановка…")
        for s in servers:
            s.shutdown()


if __name__ == "__main__":
    # 8770 — намеренно необычный порт: 5000 и 7000 на macOS занимает AirPlay.
    port = int(os.environ.get("PORT", "8770"))
    # Если HOST задан явно — уважаем его; иначе слушаем обе петли localhost.
    env_host = os.environ.get("HOST")
    hosts = [env_host] if env_host else ["127.0.0.1", "::1"]

    missing = [n for n in MODULES if not os.path.isdir(os.path.join(BUILD_DIR, n))]
    if missing:
        print(f"[studio] ВНИМАНИЕ: нет собранного фронтенда для: {', '.join(missing)}")
        print("[studio] Соберите его: bash build.sh (нужен Node/npm)")
    print(f"[studio] Студия работает: http://127.0.0.1:{port}")
    # Загрузчик импортирует бэкенды один раз при старте, поэтому reloader не нужен.
    _serve_forever(port, hosts)
