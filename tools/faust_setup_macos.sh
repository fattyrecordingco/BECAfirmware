#!/usr/bin/env bash
set -euo pipefail

echo "[faust-setup] Checking for Faust..."
if command -v faust >/dev/null 2>&1; then
  faust -v || true
  echo "[faust-setup] Faust already installed"
  exit 0
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "[faust-setup] Homebrew not found. Install Homebrew first: https://brew.sh"
  exit 1
fi

echo "[faust-setup] Installing via brew..."
brew install faust

if command -v faust >/dev/null 2>&1; then
  echo "[faust-setup] Installed successfully"
  exit 0
fi

echo "[faust-setup] Install appears unsuccessful"
exit 1
