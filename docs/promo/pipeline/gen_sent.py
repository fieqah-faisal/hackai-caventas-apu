"""Synthesize each narration line sentence by sentence; join with short pauses.
Writes <out>/<key>.wav and <out>/timings.json (sentence start/end within each line)."""
import json, re, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
models, narr, out, voice, speed = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5])
k = Kokoro(models + "/kokoro-v1.0.onnx", models + "/voices-v1.0.bin")
lines = json.load(open(narr))
GAP = 0.30
timings = {}
for key, text in lines.items():
    protected = text.replace("P.M.", "P_M_")
    parts = [p.strip().replace("P_M_", "P.M.") for p in re.split(r"(?<=[.!?])\s+", protected) if p.strip()]
    chunks, tl, cur, sr = [], [], 0.0, 24000
    for p in parts:
        s, sr = k.create(p, voice=voice, speed=speed, lang="en-us")
        idx = np.where(np.abs(s) > 0.01)[0]
        s = s[max(idx[0] - int(0.02 * sr), 0): idx[-1] + int(0.08 * sr)]
        if chunks:
            chunks.append(np.zeros(int(GAP * sr), dtype=s.dtype)); cur += GAP
        tl.append({"text": p, "start": round(cur, 3), "end": round(cur + len(s) / sr, 3)})
        chunks.append(s); cur += len(s) / sr
    sf.write(f"{out}/{key}.wav", np.concatenate(chunks), sr)
    timings[key] = {"duration": round(cur, 3), "sentences": tl}
    print(key, round(cur, 2), [round(t["start"], 2) for t in tl])
json.dump(timings, open(f"{out}/timings.json", "w"), indent=1)
