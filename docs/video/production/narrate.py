"""Synthesize the narration with Kokoro (kokoro-onnx), one WAV per line.

Usage: python narrate.py <model.onnx> <voices.bin> <outdir>
(set ESPEAK_DATA_PATH to the espeakng_loader data dir if phonemization fails)
"""
import json
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

model, voices, outdir = sys.argv[1:4]
spec = json.loads((Path(__file__).parent / "narration.json").read_text())
out = Path(outdir)
out.mkdir(parents=True, exist_ok=True)
kokoro = Kokoro(model, voices)
durations = {}
for line in spec["lines"]:
    samples, rate = kokoro.create(line["tts"], voice=spec["voice"], speed=spec["speed"], lang="en-us")
    sf.write(out / f"{line['id']}.wav", samples, rate)
    durations[line["id"]] = round(len(samples) / rate, 3)
    print(line["id"], durations[line["id"]], flush=True)
(out / "durations.json").write_text(json.dumps(durations, indent=1))
print("total", round(sum(durations.values()), 1))
