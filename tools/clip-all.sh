#!/bin/sh
# Builds out/chop-and-toss-clip.mp4: four kitchens, 4.25 s each, 60 fps, no audio. Needs the server running.
set -e
cd "$(dirname "$0")/.."
mkdir -p out/segments
for m in 0 1 2 3; do node tools/clip.mjs $m out/segments/seg$m.mp4 ${1:-4.25} ${2:-1280} ${3:-720} > out/segments/seg$m.log 2>&1 & done
wait
printf "file 'seg0.mp4'\nfile 'seg1.mp4'\nfile 'seg2.mp4'\nfile 'seg3.mp4'\n" > out/segments/list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i out/segments/list.txt -c copy -an -movflags +faststart out/chop-and-toss-clip.mp4
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration -show_entries format=duration -of default=nw=1 out/chop-and-toss-clip.mp4
