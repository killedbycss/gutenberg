#!/usr/bin/env bash
set -euo pipefail

STUDIO="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$STUDIO/.." && pwd)"
OUT="$ROOT/github-pages"

mkdir -p "$OUT/app" "$OUT/assets"
cp "$STUDIO/shell/index.html" "$ROOT/index.html"
cp "$STUDIO/shell/assets/"* "$OUT/assets/"
cp "$STUDIO/shell/assets/favicon.ico" "$OUT/favicon.ico"

# Оболочка должна работать и в корне домена, и в подпапке GitHub Pages.
perl -0pi -e 's/<html lang="ru">/<html lang="ru" data-browser-only="true">/' "$ROOT/index.html"
perl -0pi -e "s|href=\"/favicon.ico\"|href=\"./github-pages/favicon.ico\"|g; s|url\\('/assets/|url\\('./github-pages/assets/|g; s|src=\"/assets/|src=\"./github-pages/assets/|g; s|var SITE_ROOT = BROWSER_ONLY \? './' : '/';|var SITE_ROOT = BROWSER_ONLY ? './github-pages/' : '/';|g" "$ROOT/index.html"

for mod in spellcheck typograph converter layouts; do
  FRONT="$ROOT/$mod/frontend"
  TARGET="$OUT/app/$mod"
  ( cd "$FRONT" && VITE_BROWSER_ONLY=1 npx --no-install vite build --base=./ --outDir "$TARGET" --emptyOutDir )
  perl -0pi -e 's|href="/favicon.ico"|href="../../favicon.ico"|g' "$TARGET/index.html"
  # CSS лежит в app/<module>/assets, поэтому общие шрифты — тремя уровнями выше.
  find "$TARGET/assets" -name '*.css' -exec perl -pi -e 's|/assets/|../../../assets/|g' {} +
done

cp "$ROOT/converter/frontend/node_modules/fonteditor-core/woff2/woff2.wasm" "$OUT/app/converter/woff2.wasm"
touch "$ROOT/.nojekyll"

echo "Готово: $ROOT/index.html и $OUT"
