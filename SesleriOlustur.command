#!/bin/zsh
set -euo pipefail
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
print 'Bu araç replikleri Microsoft Edge çevrimiçi ses servisine gönderir ve MP3 üretir.'
print 'İnternet bağlantısı gerekir. Sesler sounds klasörüne kaydedilir.'
python3 -m venv .voice-env
.voice-env/bin/python -m pip --isolated install --index-url https://pypi.org/simple 'edge-tts>=7,<8'
.voice-env/bin/python scripts/generate_dialogues.py
open sounds/dialogue-preview.mp3
