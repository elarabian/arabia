#!/usr/bin/env bash
set -euo pipefail

if ! command -v mkcert >/dev/null 2>&1; then
  echo 'mkcert bulunamadı. Önce brew install mkcert komutunu çalıştırın.' >&2
  exit 1
fi

cd "$(dirname "$0")/.."
mkdir -p .cert
mkcert -install
mkcert -cert-file .cert/local.pem -key-file .cert/local-key.pem game.local test.local localhost 127.0.0.1
chmod 600 .cert/local-key.pem
echo 'Sertifika hazır. Yerel HTTPS için sudo env "PATH=$PATH" npm run dev:game-local komutunu çalıştırın.'
