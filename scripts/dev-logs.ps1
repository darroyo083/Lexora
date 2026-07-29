param(
    [ValidateSet("all", "frontend", "backend", "ai-service", "postgres")]
    [string] $Service = "all",
    [int] $Tail = 100,
    [switch] $Follow
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$args = @("compose", "logs", "--tail", $Tail)
if ($Follow) {
    $args += "--follow"
}
if ($Service -ne "all") {
    $args += $Service
}

Push-Location $projectRoot
try {
    & docker $args
}
finally {
    Pop-Location
}
