# Stops the background PromptForge server.
Get-NetTCPConnection -LocalPort 3777 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { taskkill /PID $_.OwningProcess /T /F | Out-Null }
