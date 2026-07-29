#!/usr/bin/env bash
# 로컬 빌드용 — 스톡피시 arm64 바이너리를 jniLibs 에 심는다.
# 폰에 이미 받아둔 게 있으면 그걸 쓰고, 없으면 공식 릴리스를 내려받는다.
# (CI 에서는 .github/workflows/build.yml 이 같은 일을 한다)
set -e
BASE="$(cd "$(dirname "$0")/.." && pwd -P)"
DEST="$BASE/android/app/src/main/jniLibs/arm64-v8a"
LOCAL="/data/data/com.termux/files/home/.stockfish/stockfish/stockfish-android-armv8"
URL="https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-android-armv8.tar"

mkdir -p "$DEST"

if [ -f "$DEST/libstockfish.so" ]; then
  echo "✅ 이미 있음: $DEST/libstockfish.so ($(du -h "$DEST/libstockfish.so" | cut -f1))"
  exit 0
fi

if [ -f "$LOCAL" ]; then
  echo "📦 폰에 있는 엔진을 복사합니다"
  cp "$LOCAL" "$DEST/libstockfish.so"
else
  echo "⬇️  공식 릴리스를 내려받습니다 (약 81MB)"
  TMP=$(mktemp -d)
  curl -fL --retry 3 "$URL" -o "$TMP/sf.tar"
  tar xf "$TMP/sf.tar" -C "$TMP"
  BIN=$(find "$TMP" -type f -name 'stockfish-android-armv8*' | head -1)
  [ -n "$BIN" ] || { echo "엔진을 찾지 못했습니다"; exit 1; }
  cp "$BIN" "$DEST/libstockfish.so"
  LIC=$(find "$TMP" -iname 'Copying.txt' | head -1)
  [ -n "$LIC" ] && cp "$LIC" "$BASE/www/assets/stockfish-COPYING.txt"
  rm -rf "$TMP"
fi

chmod +x "$DEST/libstockfish.so"
echo "✅ 준비 완료: $DEST/libstockfish.so ($(du -h "$DEST/libstockfish.so" | cut -f1))"
