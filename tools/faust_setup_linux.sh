#!/usr/bin/env bash
set -euo pipefail

echo "[faust-setup] Checking for Faust..."
if command -v faust >/dev/null 2>&1; then
  faust -v || true
  echo "[faust-setup] Faust already installed"
  exit 0
fi

if [ -f /etc/debian_version ] && command -v apt >/dev/null 2>&1; then
  echo "[faust-setup] Installing via apt..."
  sudo apt update
  sudo apt install -y faust
elif [ -f /etc/fedora-release ] && command -v dnf >/dev/null 2>&1; then
  echo "[faust-setup] Installing via dnf..."
  sudo dnf install -y faust
elif [ -f /etc/arch-release ] && command -v pacman >/dev/null 2>&1; then
  echo "[faust-setup] Installing via pacman..."
  sudo pacman -Sy --noconfirm faust
else
  echo "[faust-setup] Unsupported distro. Install Faust manually from https://faust.grame.fr"
  exit 1
fi

if command -v faust >/dev/null 2>&1; then
  echo "[faust-setup] Installed successfully"
  exit 0
fi

echo "[faust-setup] Install appears unsuccessful"
exit 1
