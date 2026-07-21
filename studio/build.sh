#!/usr/bin/env bash
# Сборка трёх фронтендов в studio/build/<модуль>.
#
# Каждый модуль собирается со своими параметрами, чтобы работать внутри Студии:
#   --base=/app/<мод>/     — правильные пути к ассетам под общим адресом
#   VITE_API_BASE=/<мод>   — запросы уходят на «/<мод>/api/...» (см. api.js)
#   --outDir studio/build/<мод>  — отдельно от автономного dist модуля
#
# Требуется Node/npm. Запускать: bash build.sh
set -euo pipefail
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"  # Finder бывает в C-locale

STUDIO="$(cd "$(dirname "$0")" && pwd)"   # .../fonts/studio
ROOT="$(cd "$STUDIO/.." && pwd)"          # .../fonts
BUILD="$STUDIO/build"

MODULES=(spellcheck typograph converter layouts)

for mod in "${MODULES[@]}"; do
  FRONT="$ROOT/$mod/frontend"
  OUT="$BUILD/$mod"
  echo ""
  echo "==> Сборка модуля: $mod"

  if [ ! -d "$FRONT" ]; then
    echo "    ! Каталог не найден: $FRONT — пропуск"
    continue
  fi

  # Зависимости фронтенда (если не установлены).
  if [ ! -d "$FRONT/node_modules" ]; then
    echo "    Установка зависимостей (npm install)…"
    ( cd "$FRONT" && npm install --no-audit --no-fund )
  fi

  echo "    Сборка (vite build)…"
  ( cd "$FRONT" && VITE_API_BASE="/$mod" npx --no-install vite build \
      --base="/app/$mod/" \
      --outDir "$OUT" \
      --emptyOutDir )
  echo "    Готово: $OUT"
done

echo ""
echo "Сборка завершена. Все фронтенды в: $BUILD"
