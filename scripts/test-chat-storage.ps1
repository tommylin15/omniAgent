$ErrorActionPreference = 'Stop'
$name = 'omniagent-acceptance-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$image = 'postgres:16-alpine'
$previousTestUrl = $env:PG_TEST_URL

try {
    $container = & wsl.exe -d Ubuntu -- docker run --rm -d --name $name `
        -e POSTGRES_USER=omniagent_test -e POSTGRES_PASSWORD=local_acceptance_only `
        -e POSTGRES_DB=omniagent_acceptance -p 127.0.0.1::5432 $image
    if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated PostgreSQL container' }
    $portLine = & wsl.exe -d Ubuntu -- docker port $name 5432
    if ($LASTEXITCODE -ne 0 -or $portLine -notmatch '127\.0\.0\.1:(\d+)$') { throw 'Could not resolve local PostgreSQL port' }
    $port = $Matches[1]
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & wsl.exe -d Ubuntu -- docker exec $name pg_isready -U omniagent_test -d omniagent_acceptance *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Isolated PostgreSQL did not become ready' }
    $env:PG_TEST_URL = "postgres://omniagent_test:local_acceptance_only@127.0.0.1:$port/omniagent_acceptance"
    & npx.cmd vitest run tests/chat_storage.acceptance.test.ts
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL storage acceptance failed' }
}
finally {
    if ($null -eq $previousTestUrl) { Remove-Item Env:PG_TEST_URL -ErrorAction SilentlyContinue }
    else { $env:PG_TEST_URL = $previousTestUrl }
    & wsl.exe -d Ubuntu -- docker rm -f $name *> $null
}
