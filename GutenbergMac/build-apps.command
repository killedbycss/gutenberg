#!/bin/zsh

set -euo pipefail

PROJECT_DIR="${0:A:h}"
DIST_DIR="$PROJECT_DIR/dist"
ICONSET_DIR="$PROJECT_DIR/../studio/app-icon.iconset"
INFO_PLIST="$PROJECT_DIR/Packaging/Info.plist"

if [[ ! -d "$ICONSET_DIR" ]]; then
    print -u2 "Не найден набор иконок: $ICONSET_DIR"
    exit 1
fi

mkdir -p "$DIST_DIR"

build_app() {
    local architecture="$1"
    local app_name="$2"
    local bundle_identifier="$3"
    local app_path="$DIST_DIR/$app_name.app"
    local executable_path="$PROJECT_DIR/.build/$architecture-apple-macosx/release/GutenbergMac"

    print "Сборка $app_name ($architecture)…"
    swift build --package-path "$PROJECT_DIR" -c release --arch "$architecture"

    mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
    cp "$executable_path" "$app_path/Contents/MacOS/GutenbergMac"
    cp "$INFO_PLIST" "$app_path/Contents/Info.plist"
    plutil -replace CFBundleDisplayName -string "$app_name" "$app_path/Contents/Info.plist"
    plutil -replace CFBundleName -string "$app_name" "$app_path/Contents/Info.plist"
    plutil -replace CFBundleIdentifier -string "$bundle_identifier" "$app_path/Contents/Info.plist"
    iconutil --convert icns --output "$app_path/Contents/Resources/AppIcon.icns" "$ICONSET_DIR"
    codesign --force --sign - "$app_path"

    print "Готово: $app_path"
}

build_app "x86_64" "Gutenberg Intel" "local.gutenberg.native.intel"
build_app "arm64" "Gutenberg Apple Silicon" "local.gutenberg.native.arm64"

print "Обе версии находятся в $DIST_DIR"
