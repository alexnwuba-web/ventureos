@echo off
title VentureOS - turn on Sign in with Google
echo.
echo  Turns on "Continue with Google" on the VentureOS sign-in page.
echo  Have your Google Client ID and Client secret ready (from Google Cloud - Credentials).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Set-VentureOS-Google.ps1"
echo.
pause
