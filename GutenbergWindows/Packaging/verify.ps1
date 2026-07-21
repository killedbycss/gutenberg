$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "GutenbergWindows.csproj", "App.xaml", "MainWindow.xaml",
  "BackendRoot\studio\backend\app.py", "BackendRoot\spellcheck\backend\app.py",
  "BackendRoot\typograph\backend\app.py", "BackendRoot\converter\backend\app.py",
  "BackendRoot\layouts\backend\app.py"
)
foreach ($item in $required) { if (-not (Test-Path (Join-Path $root $item))) { throw "Нет обязательного файла: $item" } }
Write-Host "Структура GutenbergWindows корректна."
