param(
    [ValidateSet("x64", "arm64")][string]$Architecture = "x64",
    [ValidateSet("Release", "Debug")][string]$Configuration = "Release"
)
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $project "Runtime"
$work = Join-Path $env:TEMP "gutenberg-python-$Architecture"
$pythonVersion = "3.12.10"
$pythonArch = if ($Architecture -eq "arm64") { "arm64" } else { "amd64" }
$archive = Join-Path $work "python.zip"
$url = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-$pythonArch.zip"

New-Item -ItemType Directory -Force $work, $runtime | Out-Null
Get-ChildItem $runtime -Force | Remove-Item -Recurse -Force
Invoke-WebRequest $url -OutFile $archive
Expand-Archive $archive -DestinationPath $runtime -Force
$pth = Get-ChildItem $runtime "python*._pth" | Select-Object -First 1
$lines = Get-Content $pth.FullName | Where-Object { $_ -ne "#import site" }
$lines + "Lib\site-packages" + "import site" | Set-Content $pth.FullName -Encoding ascii
Invoke-WebRequest "https://bootstrap.pypa.io/get-pip.py" -OutFile (Join-Path $work "get-pip.py")
& (Join-Path $runtime "python.exe") (Join-Path $work "get-pip.py") --no-warn-script-location
& (Join-Path $runtime "python.exe") -m pip install --disable-pip-version-check --no-warn-script-location -r (Join-Path $project "BackendRoot\studio\backend\requirements.txt")

dotnet publish (Join-Path $project "GutenbergWindows.csproj") -c $Configuration -r "win-$Architecture" --self-contained true -p:WindowsAppSDKSelfContained=true -p:PublishReadyToRun=true
$publish = Join-Path $project "bin\$Configuration\net8.0-windows10.0.22621.0\win-$Architecture\publish"
Write-Host "Готовое автономное приложение: $publish"
