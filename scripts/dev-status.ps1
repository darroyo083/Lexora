$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
    & docker compose ps
}
finally {
    Pop-Location
}
