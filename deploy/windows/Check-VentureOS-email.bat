@echo off
setlocal
title VentureOS - check email and get a sign-in code
echo.
echo  Checks why VentureOS emails (sign-in codes) are not arriving, sends a test email,
echo  and shows a sign-in code you can use right away. You will be asked for your SSH key passphrase.
echo.
set "HERE=%~dp0"
if not exist "%HERE%..\ventureos-mailcheck.sh" (
  echo  This file must stay in the deploy\windows folder of the VentureOS code.
  pause
  exit /b 1
)
set "SIGNIN="
set /p SIGNIN=" Email you sign in with - press Enter for alex@scalegate.org: "
if "%SIGNIN%"=="" set "SIGNIN=alex@scalegate.org"
set "LOG=%HERE%ventureos-email-check.txt"
echo.
type "%HERE%..\ventureos-mailcheck.sh" | ssh ubuntu@102.204.2.229 "sudo SIGNIN_EMAIL=%SIGNIN% bash -s" 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%LOG%'"
echo.
echo  Saved in ventureos-email-check.txt in this folder.
echo  Use the sign-in code under step 4 on https://ventureos.africa/signin within 10 minutes.
echo.
pause
