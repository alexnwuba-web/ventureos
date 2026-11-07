@echo off
setlocal
title VentureOS - install or update on the Lagos server
echo.
echo  Puts VentureOS on the Oxi server in Lagos (102.204.2.229), or updates it with this copy of the code:
echo   - its own database (created the first time, kept on updates)
echo   - the VentureOS service, a daily backup, and the web address with HTTPS
echo.
echo  Run this from inside the VentureOS folder you downloaded from GitHub
echo  (this file is in deploy\windows). You will be asked for your SSH key passphrase once.
echo  It takes 2 to 6 minutes. Leave this window open.
echo.
set "ROOT=%~dp0..\.."
if not exist "%ROOT%\package.json" (
  echo  This file must stay in the deploy\windows folder of the VentureOS code.
  pause
  exit /b 1
)
set "DOMAIN="
set /p DOMAIN=" Web address for VentureOS (e.g. ventureos.scalegate.org) - press Enter to keep the current one: "
set "LOG=%~dp0ventureos-log.txt"
echo.
echo  Sending the code and setting up...
tar -czf - -C "%ROOT%" --exclude=node_modules --exclude=uploads --exclude=.git . | ssh ubuntu@102.204.2.229 "sudo bash -c 'rm -rf /tmp/ventureos-src && mkdir -p /tmp/ventureos-src && tar -xzf - -C /tmp/ventureos-src && DOMAIN=%DOMAIN% bash /tmp/ventureos-src/deploy/ventureos-setup.sh'" 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%LOG%'"
echo.
echo  Finished. The last line should say VENTUREOS IS LIVE (or tell you the DNS record to add).
echo  Everything above is saved in ventureos-log.txt in this folder.
echo.
pause
