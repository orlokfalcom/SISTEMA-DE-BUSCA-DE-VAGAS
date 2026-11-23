@echo off
chcp 65001 >nul
title VagaMatch PDF - Servidor Local
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Criando ambiente virtual Python (.venv)...
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)

echo.
echo ============================================================
echo   VagaMatch PDF iniciando em http://127.0.0.1:5000
echo   Feche esta janela para encerrar o servidor.
echo ============================================================
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:5000"
.venv\Scripts\python.exe app.py
pause
