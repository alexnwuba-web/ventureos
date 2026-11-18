# Switches VentureOS's email to a mailbox you created (e.g. no-reply@ventureos.africa on Hostinger Email),
# then sends a test email. Started by Set-VentureOS-email.bat.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here 'ventureos-email-check.txt'
Write-Host ''
$user = Read-Host ' Mailbox address - press Enter for no-reply@ventureos.africa'
if (-not $user) { $user = 'no-reply@ventureos.africa' }
$sec = Read-Host " Password of $user (it will not show as you type)" -AsSecureString
$pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
if (-not $pass) { Write-Host ' No password typed - nothing changed.'; exit 1 }
$smtp = Read-Host ' Mail server - press Enter for smtp.hostinger.com'
if (-not $smtp) { $smtp = 'smtp.hostinger.com' }
$contact = Read-Host ' Address clients write to (shown on the site; replies go here) - e.g. hello@ventureos.africa, or press Enter to keep the current one'
$to = Read-Host ' Send the test email to - press Enter for alex@scalegate.org'
if (-not $to) { $to = 'alex@scalegate.org' }
$b = { param($s) [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)) }
$vals = & $b "SMTP_HOST=$smtp`nSMTP_PORT=465`nSMTP_USER=$user`nSMTP_PASS=$pass`nVENTUREOS_CONTACT=$contact`n"
$set = & $b ((Get-Content (Join-Path $here '..\ventureos-setemail.sh') -Raw) -replace "`r", '')
$chk = & $b ((Get-Content (Join-Path $here '..\ventureos-mailcheck.sh') -Raw) -replace "`r", '')
Write-Host ''
Write-Host ' Connecting to the server (type your SSH key passphrase when asked)...'
$remote = "echo $set | base64 -d > /tmp/vos-set.sh && echo $chk | base64 -d > /tmp/vos-chk.sh && sudo VOS_B64=$vals bash /tmp/vos-set.sh && sleep 2 && sudo SIGNIN_EMAIL=$to bash /tmp/vos-chk.sh; rm -f /tmp/vos-set.sh /tmp/vos-chk.sh"
& ssh ubuntu@102.204.2.229 $remote 2>&1 | Tee-Object -FilePath $log
Write-Host ''
Write-Host ' Saved in ventureos-email-check.txt in this folder.'
Write-Host ' Look under step 3: "Test email ACCEPTED" means VentureOS can now send from your new address.'
