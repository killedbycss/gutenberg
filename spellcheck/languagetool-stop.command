#!/usr/bin/env bash
#
# Остановка локального сервера LanguageTool одним кликом.
#
set -euo pipefail
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"  # Finder бывает в C-locale
cd "$(dirname "$0")"                        # папка spellcheck/

echo "LanguageTool — остановка…"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не найден — похоже, LanguageTool и не запускался. Ничего делать не нужно."
  echo "(окно можно закрыть)"; read -r _; exit 0
fi

docker compose down
echo "✓ LanguageTool остановлен. Вкладка «Орфография» снова покажет подсказку."
echo "  Включить обратно: двойной клик по languagetool-start.command"
