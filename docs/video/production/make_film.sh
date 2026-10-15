#!/usr/bin/env bash
# Rebuilds docs/video/caventas-product-film.mp4 end to end.
#
# Requirements: repo .venv with backend requirements, frontend node_modules
# (npm ci), ffmpeg, pdftoppm, a Chromium binary, and a separate Python venv
# with kokoro-onnx, soundfile, scipy, numpy and pillow (TTS_PY) plus the
# Kokoro model files (KOKORO_MODEL, KOKORO_VOICES).
#
#   WORK=/tmp/film CHROME=/path/to/chrome PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs \
#   TTS_PY=/path/to/venv/bin/python KOKORO_MODEL=kokoro-v1.0.onnx KOKORO_VOICES=voices-v1.0.bin \
#   WORLD_ATLAS=/path/to/world-atlas/land-110m.json docs/video/production/make_film.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
WORK="${WORK:?set WORK to a scratch directory}"
mkdir -p "$WORK"

# 1. Real app: deterministic backend (in-memory store, replayed planner) + API-mode UI.
"$REPO/.venv/bin/python" "$HERE/capture_backend.py" > "$WORK/backend.log" 2>&1 &
BACKEND=$!
(cd "$REPO/frontend" && VITE_DATA_MODE=api npx vite --port 5173 --strictPort > "$WORK/frontend.log" 2>&1) &
FRONTEND=$!
trap 'kill $BACKEND $FRONTEND 2>/dev/null || true' EXIT
until curl -sf localhost:8000/health >/dev/null && curl -sf localhost:5173 >/dev/null; do sleep 1; done

# 2. Drive and record the workspace.
node "$HERE/capture.mjs" "$WORK/capture"

# 3. Narration, motion-graphics assets, compositor build.
ESPEAK_DATA_PATH="${ESPEAK_DATA_PATH:-}" "$TTS_PY" "$HERE/narrate.py" "$KOKORO_MODEL" "$KOKORO_VOICES" "$WORK/vo"
"$TTS_PY" "$HERE/prepare_assets.py" "$WORLD_ATLAS" "$WORK/assets"
"$TTS_PY" "$HERE/build.py" "$WORK/capture" "$WORK/vo" "$WORK/assets" "$WORK/build"

# 4. Render frames (writes build/cues.json), then the score and mix.
node "$HERE/render.mjs" "$WORK/build" "$WORK/frames" 4
"$TTS_PY" "$HERE/audio.py" "$WORK/build/cues.json" "$WORK/vo" "$WORK/mix.wav"

# 5. Encode.
# A temporal-only denoise removes the per-frame film grain (half the bitrate)
# without blurring UI text; the limiter keeps AAC true peaks under -1.5 dBTP.
ffmpeg -y -framerate 30 -i "$WORK/frames/%05d.jpg" -i "$WORK/mix.wav" -vf "hqdn3d=0:0:6:6" \
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -af "loudnorm=I=-16:TP=-2:LRA=11,alimiter=limit=0.8:level=false:attack=3:release=60" \
  -c:a aac -b:a 192k -ar 48000 -shortest "$REPO/docs/video/caventas-product-film.mp4"
ffmpeg -y -ss 38.5 -i "$REPO/docs/video/caventas-product-film.mp4" -frames:v 1 -vf scale=1280:-2 -q:v 3 \
  "$REPO/docs/video/caventas-product-film-poster.jpg"
