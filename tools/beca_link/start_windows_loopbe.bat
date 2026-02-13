@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
)

".venv\Scripts\python.exe" -m pip install -r requirements.txt >nul

echo Starting BECA Link with LoopBe output...
echo (Press Ctrl+C to stop)
".venv\Scripts\python.exe" "beca_link.py" --midi-port "LoopBe Internal MIDI"
echo.
echo Bridge exited with code %ERRORLEVEL%.
pause
