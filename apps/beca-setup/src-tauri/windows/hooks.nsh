!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Checking bundled BECA USB serial driver installers..."

  ${If} ${FileExists} "$INSTDIR\resources\drivers\windows\CH341SER.EXE"
    DetailPrint "Installing WCH CH340/CH341 USB serial driver..."
    ExecWait '"$INSTDIR\resources\drivers\windows\CH341SER.EXE" /S /norestart' $0
    DetailPrint "WCH driver installer exited with code $0"
  ${Else}
    DetailPrint "WCH CH340/CH341 driver installer not bundled; see Read Before First Launch."
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\resources\drivers\windows\CP210xVCPInstaller_x64.exe"
    DetailPrint "Installing Silicon Labs CP210x USB serial driver..."
    ExecWait '"$INSTDIR\resources\drivers\windows\CP210xVCPInstaller_x64.exe" /S /norestart' $1
    DetailPrint "CP210x driver installer exited with code $1"
  ${Else}
    DetailPrint "Silicon Labs CP210x driver installer not bundled; see Read Before First Launch."
  ${EndIf}

  MessageBox MB_ICONINFORMATION|MB_OK "BECA installation is complete. Restart this computer before first use if any USB serial driver was installed or updated."
!macroend

