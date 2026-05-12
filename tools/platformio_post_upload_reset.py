Import("env")


def _post_upload_reset(source, target, env):
    port = env.subst("$UPLOAD_PORT") or env.GetProjectOption("upload_port", "")
    if not port:
        return

    try:
        import time
        import serial

        # Some CH340 ESP32 boards keep USB serial lines in a state where the
        # sketch runs but Wi-Fi/HTTP does not recover until Serial Monitor opens.
        # Briefly opening the port mirrors that known-good recovery path.
        with serial.Serial(port, 115200, timeout=0.1, write_timeout=0.1) as ser:
            time.sleep(0.8)
            ser.dtr = False
            time.sleep(0.12)
            ser.rts = False
            time.sleep(0.12)
    except Exception as exc:
        print("BECA post-upload reset skipped: %s" % exc)


env.AddPostAction("upload", _post_upload_reset)
