$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$portalUrl = "http://localhost:3000"
$statusUrl = "$portalUrl/api/auth/status"

try {
    $portalReady = $false
    try {
        Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2 | Out-Null
        $portalReady = $true
    } catch {
        $node = Get-Command node -ErrorAction Stop
        Start-Process -FilePath $node.Source -ArgumentList "server.js" -WorkingDirectory $projectDirectory -WindowStyle Hidden
    }

    if (-not $portalReady) {
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Seconds 1
            try {
                Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2 | Out-Null
                $portalReady = $true
                break
            } catch {
                # Keep waiting while the local Node.js server starts.
            }
        }
    }

    if (-not $portalReady) {
        throw "Portal-ku ma bilaaban. Hubi in Node.js rakiban yahay, kadib mar kale isku day."
    }

    Start-Process $portalUrl
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        "MidnimoMain Dashboard",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}
