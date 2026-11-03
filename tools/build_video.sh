#!/bin/sh
# Web versions of the 3ds Max animation from _manba (needs ffmpeg). Run from the project root.
#  hero-loop: 9 s street-level shot, muted, ~1.5 MB, starts only after the hero image is on screen
#  film:      the whole 1:33 animation with sound, 720p, only loaded when the visitor presses play
set -e
FF=${FFMPEG:-ffmpeg}
SRC="_manba/42-/3D MAX/3D max 2/business center/RENDER/animation 1min.mp4"
OUT=assets/video
mkdir -p "$OUT"
rm -f "$OUT/hero-loop.webm"

"$FF" -v error -y -ss 18.5 -t 9 -i "$SRC" -an -vf "scale=960:-2,fps=25" \
  -c:v libx264 -profile:v high -preset veryslow -crf 31 -pix_fmt yuv420p -movflags +faststart "$OUT/hero-loop.mp4"

"$FF" -v error -y -i "$SRC" -vf scale=1280:-2 -c:v libx264 -profile:v high -preset slow -crf 30 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart "$OUT/film-720.mp4"
"$FF" -v error -y -ss 50 -i "$SRC" -frames:v 1 -vf scale=1280:-2 -c:v libwebp -quality 72 "$OUT/film-poster.webp"
ls -la "$OUT"
