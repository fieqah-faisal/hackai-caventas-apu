#!/bin/bash
set -e
cd "$(dirname "$0")"
r() { rm -rf scenes/$1; node render_scene.js "$2" scenes/$1 $3 > logs_$1.txt 2>&1 && echo "done $1" || echo "FAIL $1"; }
mkdir -p scenes
r S01 scenes_src/S01_intro.html 23.8 &
r S04 scenes_src/S04_pipeline.html 17.4 &
wait
r S02 scenes_src/S02_brand.html 13.8 &
r S06 scenes_src/S06_close.html 11.0 &
wait
r S03 scenes_src/S03_graph.html 6.0 &
r T09 "scenes_src/term.html?T09" 6.0 &
wait
r T11 "scenes_src/term.html?T11" 4.8 &
r T07 "scenes_src/term.html?T07" 3.8 &
wait
r T08 "scenes_src/term.html?T08" 3.0 &
r S05 scenes_src/S05_pdf.html 3.4 &
wait
echo ALL DONE
