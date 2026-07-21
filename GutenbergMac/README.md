# GutenbergMac

Нативное приложение для macOS, полностью построенное на SwiftUI.

## Требования

- macOS 13 или новее
- Xcode 16 или новее
- Swift 6

## Запуск

Откройте `Package.swift` в Xcode, выберите схему `GutenbergMac` и нажмите Run.

## Поддерживаемые Mac

Проект не ограничивает `ARCHS` и использует стандартные архитектуры macOS:

- Apple Silicon (`arm64`)
- Intel (`x86_64`)

Для распространения собирайте приложение как Universal Binary / Any Mac в Xcode.
