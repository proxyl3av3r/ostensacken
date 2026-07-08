# Статичний сервер на PowerShell HttpListener — лише для локального перегляду лендінга.
# Реальний бекенд — server.js (Express) на VPS.
$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\public' | Resolve-Path | Select-Object -ExpandProperty Path
$port = if ($env:PORT) { $env:PORT } else { 5173 }

$mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.svg'='image/svg+xml';
  '.woff2'='font/woff2'; '.woff'='font/woff'; '.ttf'='font/ttf'; '.otf'='font/otf'; '.ico'='image/x-icon'; '.json'='application/json; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Static preview on http://localhost:$port  (root: $root)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $urlPath = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($urlPath -eq '/') { $urlPath = '/index.html' }
    $rel = $urlPath.TrimStart('/') -replace '/', '\'
    $file = Join-Path $root $rel
    $full = [System.IO.Path]::GetFullPath($file)
    # no-cache під час розробки, щоб правки одразу було видно
    $ctx.Response.Headers['Cache-Control'] = 'no-store, must-revalidate'
    if (-not $full.StartsWith($root) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.OutputStream.Close()
    } else {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $total = (Get-Item -LiteralPath $full).Length
      $range = $ctx.Request.Headers['Range']
      $ctx.Response.Headers['Accept-Ranges'] = 'bytes'
      if ($range -and $range -match 'bytes=(\d*)-(\d*)') {
        # HTTP Range (потрібно для відтворення/перемотки відео)
        $startS = $matches[1]; $endS = $matches[2]
        $start = if ($startS -ne '') { [int64]$startS } else { 0 }
        $end   = if ($endS   -ne '') { [int64]$endS   } else { $total - 1 }
        if ($end -ge $total) { $end = $total - 1 }
        if ($start -gt $end) { $start = 0 }
        $len = $end - $start + 1
        $fs = [System.IO.File]::OpenRead($full)
        $fs.Seek($start, 'Begin') | Out-Null
        $buf = New-Object byte[] $len
        $read = $fs.Read($buf, 0, $len); $fs.Close()
        $ctx.Response.StatusCode = 206
        $ctx.Response.Headers['Content-Range'] = "bytes $start-$end/$total"
        $ctx.Response.ContentLength64 = $read
        $ctx.Response.OutputStream.Write($buf, 0, $read)
        $ctx.Response.OutputStream.Close()
      } else {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ctx.Response.StatusCode = 200
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.OutputStream.Close()
      }
    }
  } catch {
    try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch {}
  }
}
