@echo off
rem Starts the Floating Ink listener: Claude answers in the app's chat panel, with no chat window open.
rem Close this window to stop it.
chcp 65001 >nul
title Claude in Floating Ink
node "%~dp0watch.js"
echo.
echo -- stopped --
pause
