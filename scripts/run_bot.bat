@echo off
rem Runs the bot from the repository root regardless of where this file is launched from.
cd /d "%~dp0.."
node --env-file=.env src\main.js
pause
