# Turns on "Continue with Google" for VentureOS: asks for the Google Client ID and secret, saves them on the server,
# checks them with Google and restarts VentureOS. Started by Set-VentureOS-Google.bat.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here 'ventureos-google-check.txt'
Write-Host ''
$id = (Read-Host ' Paste the Client ID (ends in .apps.googleusercontent.com)').Trim()
if (-not $id) { Write-Host ' No Client ID typed - nothing changed.'; exit 1 }
$sec = Read-Host ' Paste the Client secret (it will not show as you paste)' -AsSecureString
$secret = ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))).Trim()
if (-not $secret) { Write-Host ' No Client secret typed - nothing changed.'; exit 1 }
$b = { param($s) [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)) }
$vals = & $b "VENTUREOS_GOOGLE_CLIENT_ID=$id`nVENTUREOS_GOOGLE_CLIENT_SECRET=$secret`n"
$set = & $b ((Get-Content (Join-Path $here '..\ventureos-setgoogle.sh') -Raw) -replace "`r", '')
Write-Host ''
Write-Host ' Connecting to the server (type your SSH key passphrase when asked)...'
$remote = "echo $set | base64 -d > /tmp/vos-g.sh && sudo VOS_B64=$vals bash /tmp/vos-g.sh; rm -f /tmp/vos-g.sh"
& ssh ubuntu@102.204.2.229 $remote 2>&1 | Tee-Object -FilePath $log
Write-Host ''
Write-Host ' Saved in ventureos-google-check.txt in this folder. Look for the line starting with DONE.'
