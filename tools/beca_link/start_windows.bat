@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Creating Python virtual environment...
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Failed to create venv. Install Python 3 first.
    exit /b 1
  )
)

echo Installing/updating bridge dependencies...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency install failed.
  pause
  exit /b 1
)

set "MIDI_PORT_NAME=auto"

echo.
echo Serial ports seen by bridge:
".venv\Scripts\python.exe" "beca_link.py" --list
echo.
echo MIDI ports seen by bridge:
".venv\Scripts\python.exe" "beca_link.py" --midi-list
echo.
echo Starting BECA Link...
echo Requested MIDI port: %MIDI_PORT_NAME%
echo (Press Ctrl+C to stop)
echo.
".venv\Scripts\python.exe" -u "beca_link.py" --midi-port "%MIDI_PORT_NAME%"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo BECA Link exited with error code %EXITCODE%.
  echo If "BECA Serial MIDI" is not listed above, test with:
  echo   python beca_link.py --midi-port "LoopBe Internal MIDI"
)
pause
