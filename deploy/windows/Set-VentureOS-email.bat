@echo off
title VentureOS - send email from a new mailbox
echo.
echo  Switches VentureOS's emails (sign-in codes, invitations, letters) to a mailbox you created,
echo  for example no-reply@ventureos.africa, and sends a test email.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Set-VentureOS-email.ps1"
echo.
pause
