# Runs Dunyatek Rug Pattern Tool (backend + frontend)
# Usage: Right-click -> Run with PowerShell, or:
#   powershell -ExecutionPolicy Bypass -File .\desenrun.ps1

$ErrorActionPreference = 'Stop'

function Start-Backend {
  param([string]$Path)
  $backend = Join-Path $Path 'backend'
  if (!(Test-Path $backend)) { throw "Backend klasörü bulunamadı: $backend" }

  $cmd = @(
    "Set-Location -Path `"$backend`"",
    "if (!(Test-Path .venv)) { python -m venv .venv }",
    ".\\.venv\\Scripts\\activate",
    "pip install -r requirements.txt",
    "python app.py"
  ) -join '; '
  Start-Process -FilePath powershell -ArgumentList '-NoExit', '-Command', $cmd -WindowStyle Normal
}

function Start-Frontend {
  param([string]$Path)
  $frontend = Join-Path $Path 'frontend'
  if (!(Test-Path $frontend)) { throw "Frontend klasörü bulunamadı: $frontend" }

  $cmd = @(
    "Set-Location -Path `"$frontend`"",
    "if (Test-Path package-lock.json) { npm ci } else { npm install }",
    "npm run dev"
  ) -join '; '
  Start-Process -FilePath powershell -ArgumentList '-NoExit', '-Command', $cmd -WindowStyle Normal
}

try {
  $root = Split-Path -Parent $MyInvocation.MyCommand.Path
  Write-Host "Proje kökü: $root" -ForegroundColor Cyan
  Start-Backend -Path $root
  Start-Frontend -Path $root
  Write-Host "Backend: http://127.0.0.1:5000" -ForegroundColor Green
  Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
  Write-Host "İki ayrı PowerShell penceresi açıldı. Kapatmak için pencereleri kapatabilirsiniz." -ForegroundColor Yellow
}
catch {
  Write-Error $_
  exit 1
}
