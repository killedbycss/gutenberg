#!/usr/bin/env bash
#
# Запуск локального сервера LanguageTool (проверка орфографии) одним кликом.
# Подробности и устранение неполадок — см. LANGUAGETOOL.md рядом.
#
set -euo pipefail
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"  # Finder бывает в C-locale
cd "$(dirname "$0")"                        # папка spellcheck/

echo "════════════════════════════════════════════"
echo "  LanguageTool — запуск проверки орфографии"
echo "════════════════════════════════════════════"

# --- Проверки Docker --------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker не найден."
  echo "  Установите Docker Desktop: https://www.docker.com/products/docker-desktop/"
  echo "  Затем снова запустите этот файл."
  echo "(окно можно закрыть)"; read -r _; exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker установлен, но не запущен."
  echo "  Откройте приложение Docker Desktop, дождитесь, пока значок кита"
  echo "  перестанет мигать, и запустите этот файл снова."
  echo "(окно можно закрыть)"; read -r _; exit 1
fi

# --- Запуск -----------------------------------------------------------------
echo "→ Запускаю LanguageTool (docker compose up -d)…"
docker compose up -d

echo "→ Жду готовности сервера…"
echo "  (первый запуск скачивает образ ~1 ГБ — это может занять несколько минут)"
for _ in $(seq 1 150); do
  if curl -sf "http://localhost:8010/v2/languages" >/dev/null 2>&1; then
    echo ""
    echo "✓ Готово! LanguageTool работает: http://localhost:8010"
    echo "  Откройте или обновите вкладку «Орфография» — проверка заработает."
    echo "  Остановить позже: двойной клик по languagetool-stop.command"
    exit 0
  fi
  sleep 2
done

echo ""
echo "⚠ Сервер пока не ответил — возможно, ещё скачивается образ."
echo "  Проверьте чуть позже: curl http://localhost:8010/v2/languages"
echo "  Логи: docker compose logs -f languagetool"
echo "(окно можно закрыть)"; read -r _
