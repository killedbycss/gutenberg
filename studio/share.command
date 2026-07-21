#!/usr/bin/env bash
#
# Собрать проект в один архив для передачи на другой Mac.
# Двойной клик — на Рабочем столе появится «Студия-ГГГГММДД.zip».
#
# Из архива исключены тяжёлые и привязанные к компьютеру папки
# (node_modules, виртуальные окружения, кеши). Папка studio/build включена —
# поэтому на целевом Mac не нужен Node.js.
#
set -euo pipefail
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"  # Finder бывает в C-locale
cd "$(dirname "$0")"                        # studio/
STUDIO="$(pwd)"
ROOT="$(cd .. && pwd)"                       # корень проекта (fonts)
NAME="$(basename "$ROOT")"

echo "→ Проверяю собранные интерфейсы…"
need_build=0
for m in spellcheck typograph converter layouts; do
  [ -d "$STUDIO/build/$m" ] || need_build=1
done
if [ "$need_build" = "1" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "→ Собираю интерфейсы перед упаковкой…"
    bash "$STUDIO/build.sh"
  else
    echo "⚠ Нет папки studio/build и не найден npm — архив будет без собранных"
    echo "  интерфейсов, и на другом Mac понадобится Node.js для сборки."
  fi
fi

STAMP="$(date +%Y%m%d)"
OUT="$HOME/Desktop/Студия-$STAMP.zip"
STAGE="$(mktemp -d)"
DEST="$STAGE/$NAME"

echo "→ Готовлю чистую копию…"
rsync -a \
  --exclude 'node_modules' \
  --exclude '.venv' --exclude 'venv' --exclude 'env' \
  --exclude '__pycache__' --exclude '*.pyc' --exclude '.pytest_cache' \
  --exclude 'dist' \
  --exclude '.DS_Store' --exclude '.git' \
  --exclude '#' --exclude 'первый' \
  "$ROOT/" "$DEST/"

echo "→ Создаю архив…"
rm -f "$OUT"
( cd "$STAGE" && zip -r -q -X "$OUT" "$NAME" )
rm -rf "$STAGE"

SIZE="$(du -h "$OUT" | cut -f1)"
echo ""
echo "✓ Готово: $OUT  ($SIZE)"
echo "  Передайте этот файл. На другом Mac: распаковать → двойной клик studio/start.command."
open -R "$OUT" 2>/dev/null || true
