$ports = @(8000, 8443, 5173)

function Stop-PortListeners($port) {
    1..5 | ForEach-Object {
        $pids = @()
        Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
            ForEach-Object { $pids += $_.OwningProcess }
        netstat -ano | Select-String ":$port\s" | ForEach-Object {
            $procId = ($_ -split '\s+')[-1]
            if ($procId -match '^\d+$' -and $procId -ne '0') { $pids += [int]$procId }
        }
        foreach ($procId in ($pids | Select-Object -Unique)) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            taskkill /F /PID $procId 2>$null | Out-Null
        }
        Start-Sleep -Milliseconds 500
    }
}

foreach ($port in $ports) {
    Stop-PortListeners $port
}

Write-Host "[OK] Stopped ports 8000, 8443, 5173"
