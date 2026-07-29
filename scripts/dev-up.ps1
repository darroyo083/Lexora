$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
    & docker compose up -d --build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    & docker compose ps
}
finally {
    Pop-Location
}
