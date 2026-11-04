# Collect the installer bundles produced by `npm run tauri build` into a
# single release folder. Run from the repository root AFTER a successful
# build on Windows.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1
param(
    [string]$OutDir = "release"
)

$Bundle = "src-tauri\target\release\bundle"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$patterns = @(
    @{ Sub = "nsis";     Pattern = "*.exe" },
    @{ Sub = "msi";      Pattern = "*.msi" }
)

$found = $false
foreach ($p in $patterns) {
    $dir = Join-Path $Bundle $p.Sub
    if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Filter $p.Pattern | ForEach-Object {
            Write-Host "  + $($_.Name)"
            Copy-Item $_.FullName -Destination $OutDir -Force
            $found = $true
        }
    }
}

if ($found) {
    Write-Host "Installer copiati in $OutDir"
} else {
    Write-Host "Nessun installer trovato sotto $Bundle. Esegui prima 'npm run tauri build'."
    exit 1
}
