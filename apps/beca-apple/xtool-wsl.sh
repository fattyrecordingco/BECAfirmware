#!/usr/bin/env bash
set -euo pipefail

app_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tool_dir="$HOME/.local/share/beca-apple"
swift_env="${SWIFTLY_HOME_DIR:-$HOME/.local/share/swiftly}/env.sh"
action="${1:-doctor}"
shift || true
cd -- "$app_dir"

if [[ "$action" == setup ]]; then
    source /etc/os-release
    if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
        echo "This installer targets Ubuntu 24.04. See the upstream guide for other distributions." >&2
        exit 1
    fi
    sudo apt-get update
    sudo apt-get install -y ca-certificates clang curl git gnupg libcurl4-openssl-dev \
        libedit-dev libicu-dev libncurses-dev libsqlite3-dev libssl-dev libxml2-dev \
        libzstd-dev pkg-config python3 unzip usbmuxd libimobiledevice-utils zlib1g-dev
    mkdir -p "$tool_dir/downloads" "$tool_dir/bin"
    case "$(uname -m)" in
        x86_64) arch=x86_64; digest=e2277e59bb2fda9b487cbc77ad080ea2b0370bb740ac0f02cc42fa28a272d3a5 ;;
        aarch64) arch=aarch64; digest=470d55880379de9696a048f4293a0b05a7fc43beba423ffe6c294a4975dcebf7 ;;
        *) echo "Unsupported host architecture" >&2; exit 1 ;;
    esac
    if [[ ! -f "$swift_env" ]]; then
        curl -fL "https://download.swift.org/swiftly/linux/swiftly-$arch.tar.gz" \
            -o "$tool_dir/downloads/swiftly.tar.gz"
        tar -xzf "$tool_dir/downloads/swiftly.tar.gz" -C "$tool_dir/downloads"
        "$tool_dir/downloads/swiftly" init --assume-yes --skip-install --quiet-shell-followup
    fi
    source "$swift_env"
    swiftly install 6.4.0 --assume-yes
    cached="$app_dir/../../.beca-cache/apple-tools/xtool-$arch.AppImage"
    image="$tool_dir/xtool-1.21.0.AppImage"
    if [[ -f "$cached" ]]; then
        cp -- "$cached" "$image"
    else
        curl -fL "https://github.com/xtool-org/xtool/releases/download/1.21.0/xtool-$arch.AppImage" -o "$image"
    fi
    printf '%s  %s\n' "$digest" "$image" | sha256sum --check --status
    chmod +x "$image"
    cat > "$tool_dir/bin/xtool" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
tool_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# WSL does not need FUSE when the AppImage extracts its runtime on launch.
export APPIMAGE_EXTRACT_AND_RUN=1
exec "$tool_dir/xtool-1.21.0.AppImage" "$@"
WRAPPER
    chmod +x "$tool_dir/bin/xtool"
    echo "Installed xtool 1.21.0 and Swift 6.4.0. Apple SDK and authentication are separate steps."
    action=doctor
fi

if [[ -f "$swift_env" ]]; then source "$swift_env"; fi
export PATH="$tool_dir/bin:$PATH"
case "$action" in
    doctor)
        swift --version
        xtool --version
        xtool sdk status
        # Parse the manifest without compiling Apple frameworks or signing.
        swift package dump-package > /dev/null
        ;;
    build|run)
        if [[ ! -f build/xtool-Info.plist || ! -f BECAApple/Web/beca-synth.wasm ]]; then
            echo "Run node apps/beca-apple/prepare.mjs from the Windows repository first." >&2
            exit 1
        fi
        exec xtool dev "$action" "$@"
        ;;
    auth|sdk|devices|install|launch) exec xtool "$action" "$@" ;;
    *) echo "Usage: bash xtool-wsl.sh {setup|doctor|build|run|auth|sdk|devices|install|launch} [arguments]" >&2; exit 2 ;;
esac
