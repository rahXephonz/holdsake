#!/bin/sh
# Shrinks the phone recordings in /hackathon into public/demo for the Demo composition: 720 px
# wide, 30 fps to match the video, no sound (the voiceover and music carry the audio). The
# originals are ~100 MB each and stay out of git; so do these. The status bar (clock, the
# recording dot and the Dynamic Island) is painted over in white, the app's own background.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/demo
for name in recording-1 recording-2 recording-3; do
  ffmpeg -v error -y -i "../../hackathon/$name.MP4" -an -vf "format=rgb24,drawbox=x=0:y=0:w=iw:h=ih*0.065:color=white:t=fill,fps=30,scale=720:-2" \
    -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p "public/demo/$name.mp4"
  echo "public/demo/$name.mp4"
done
