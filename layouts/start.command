#!/bin/bash
# Запуск модуля «Макеты» на macOS одним кликом:
# поднимает backend (:5070) и frontend (:5175), открывает браузер.
set -e
cd "$(dirname "$0")"

# --- Backend (тонкий сервис метрик) ---
cd backend
if [ ! -d .venv ]; then
  echo "→ Создаю venv и ставлю зависимости backend…"
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi
PORT=5070 .venv/bin/python -c "import app; app.app.run(host='127.0.0.1', port=5070)" &
BACK_PID=$!
cd ..

# --- Frontend ---
cd frontend
if [ ! -d node_modules ]; then
  echo "→ Ставлю зависимости frontend…"
  npm install
fi
npm run dev &
FRONT_PID=$!
cd ..

# Останавливаем оба процесса при выходе (Ctrl-C / закрытие окна).
trap 'echo; echo "Останавливаю…"; kill $BACK_PID $FRONT_PID 2>/dev/null; exit 0' INT TERM

sleep 2
open http://localhost:5175
echo "Backend :5070 (pid $BACK_PID) · Frontend :5175 (pid $FRONT_PID). Ctrl-C — стоп."
wait
