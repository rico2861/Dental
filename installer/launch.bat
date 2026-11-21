@echo off
REM ── DENTAL — lanceur Windows ─────────────────────────────────────────
REM Les données et la configuration vont dans un dossier INSCRIPTIBLE (ProgramData),
REM jamais dans Program Files. Node est embarqué (aucune installation requise).
set "DATA_ROOT=%ALLUSERSPROFILE%\DENTAL"
if not exist "%DATA_ROOT%" mkdir "%DATA_ROOT%"
cd /d "%~dp0backend"
"%~dp0node\node.exe" scripts\init-env.js
"%~dp0node\node.exe" src\server.js
