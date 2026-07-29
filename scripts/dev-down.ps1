$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
    & docker compose down --remove-orphans
}
finally {
    Pop-Location
}
