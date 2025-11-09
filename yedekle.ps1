param(
    [string]$Destination = "C:\Backups",
    [string]$NamePrefix = "dunyatek",
    [string[]]$Exclude = @(
        ".git",
        "node_modules",
        ".venv",
        "backend/output",
        "frontend/dist",
        "__pycache__"
    )
)

$ErrorActionPreference = 'Stop'

try {
    # Kaynak proje dizini (scriptin bulunduğu klasör)
    $Source = Split-Path -Parent $PSCommandPath

    if (-not (Test-Path -Path $Destination)) {
        New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    }

    $ts = Get-Date -Format yyyyMMdd_HHmm
    $archive = Join-Path $Destination ("{0}_{1}.tar.gz" -f $NamePrefix, $ts)

    # Exclude parametrelerini tar komutuna dönüştür
    $excludeArgs = @()
    foreach ($e in $Exclude) { $excludeArgs += @("--exclude=$e") }

    Write-Host "Kaynak: $Source"
    Write-Host "Hedef:  $archive"
    Write-Host "Hariç:  $($Exclude -join ', ')"

    # Arşivle
    tar -C $Source -czf $archive @excludeArgs .

    Write-Host "Yedek oluşturuldu: $archive"
}
catch {
    Write-Error "Yedekleme hatası: $($_.Exception.Message)"
    exit 1
}
