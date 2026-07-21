#!/usr/bin/env bash
#
# Студия — запуск одним двойным кликом (macOS).
#
# Что делает:
#   1) создаёт локальное окружение Python (.venv) и ставит зависимости;
#   2) при отсутствии собранных фронтендов — собирает их (нужен Node/npm);
#   3) проверяет LanguageTool (для орфографии) и подсказывает, если его нет;
#   4) запускает единый сервер и открывает браузер.
#
# Настройки через переменные окружения (необязательно):
#   PORT=7000   — порт Студии
#
set -euo pipefail
cd "$(dirname "$0")"                       # каталог studio/

# Локаль UTF-8 ОБЯЗАТЕЛЬНА: Finder запускает .command часто вообще без локали
# (среда C/POSIX). Тогда bash ломается на кириллице в выводе и на конструкциях
# вида «$PORT» вплотную к многобайтовому «…» — и при set -u
# падает с «unbound variable» ещё до запуска сервера. Отсюда «ссылка не
# открывается»: сервер просто не стартовал.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

PORT="${PORT:-8770}"   # 8770: 5000/7000 на macOS заняты AirPlay Receiver
PY="${PYTHON:-python3}"

echo "════════════════════════════════════════════"
echo "  Студия — инструменты дизайнера"
echo "════════════════════════════════════════════"

# --- 1) Python-окружение ----------------------------------------------------
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "✗ Не найден $PY. Установите Python 3 с https://www.python.org/downloads/ и повторите."
  echo "  (окно можно закрыть)"; read -r _; exit 1
fi

if [ ! -d ".venv" ]; then
  echo "→ Создаю окружение Python (.venv)…"
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "→ Устанавливаю зависимости Python…"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r backend/requirements.txt

# --- 2) Фронтенды -----------------------------------------------------------
need_build=0
for m in spellcheck typograph converter layouts; do
  [ -d "build/$m" ] || need_build=1
done
if [ "$need_build" = "1" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "→ Собираю фронтенды (первый запуск)…"
    bash build.sh
  else
    echo "✗ Нет собранных фронтендов и не найден npm (Node.js)."
    echo "  Вариант А: установите Node.js с https://nodejs.org и перезапустите."
    echo "  Вариант Б: попросите прислать проект вместе с папкой studio/build."
    read -r _; exit 1
  fi
fi

# --- 3) LanguageTool (орфография) — онлайн ----------------------------------
# Проверка орфографии работает онлайн (api.languagetool.org): ничего ставить
# не нужно (ни Docker, ни Java), нужен только интернет. Приватную/офлайн-проверку
# можно включить, задав свой сервер: LT_URL=http://localhost:8010 ./start.command
echo "ℹ Проверка орфографии работает онлайн (LanguageTool) — нужен интернет."
echo "  Приватно/офлайн? Укажите свой сервер: LT_URL=http://localhost:8010"

# --- 4) Запуск --------------------------------------------------------------
# ВАЖНО: адрес именно 127.0.0.1, а не localhost. localhost на macOS может
# резолвиться в IPv6 (::1), и некоторые браузеры не открывают страницу. По
# 127.0.0.1 (IPv4) сервер отвечает всегда.
URL="http://127.0.0.1:$PORT"

# Уже запущено (например, второй двойной клик)? — просто открываем браузер.
if curl -sf "$URL/healthz" >/dev/null 2>&1; then
  echo "✓ Студия уже работает — открываю браузер."
  echo "   Адрес: $URL"
  open "$URL" >/dev/null 2>&1 || true
  echo "(это окно можно закрыть)"
  exit 0
fi

echo "→ Запускаю сервер на порту ${PORT}…"
PORT="$PORT" python backend/app.py &
SERVER_PID=$!
trap 'echo; echo "→ Останавливаю сервер…"; kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM

# Ждём готовности сервера.
ready=0
for _ in $(seq 1 60); do
  if curl -sf "$URL/healthz" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done

echo ""
echo "──────────────────────────────────────────────"
if [ "$ready" = "1" ]; then
  echo "  ✓ Студия готова. Откройте в браузере:"
else
  echo "  ⚠ Сервер ещё поднимается — откройте через пару секунд:"
fi
echo ""
echo "        $URL"
echo ""
echo "  (в Терминале по ссылке можно кликнуть, удерживая ⌘)"
echo "──────────────────────────────────────────────"

# Пытаемся открыть браузер автоматически. Если не откроется — ссылка выше.
open "$URL" >/dev/null 2>&1 || true

echo ""
echo "Студия работает. Чтобы остановить — закройте это окно или нажмите Ctrl+C."
wait $SERVER_PID
