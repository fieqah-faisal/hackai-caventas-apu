"""Assemble the final promo: video segments + narration + score.

python3 assemble.py <out.mp4>
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import edl  # noqa: E402

FPS = 30
OUT = sys.argv[1]
SEG = os.path.join(HERE, "out")
VO = os.path.join(SP, "audio", "vo")


def run(cmd):
    print("+", " ".join(cmd[:6]), "...")
    subprocess.run(cmd, check=True)


def scene_mp4(sid):
    src = os.path.join(HERE, "scenes", sid)
    dst = os.path.join(SEG, f"{sid}.mp4")
    run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(src, "%05d.png"),
         "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", dst])
    return dst


# 1) video: concat segments in timeline order (re-encode once at the end)
parts, starts, t = [], {}, 0.0
for sid, kind, dur, _ in edl.TIMELINE:
    starts[sid] = t
    t += dur
    path = os.path.join(SEG, f"{sid}.mp4")
    if kind == "scene" and not os.path.exists(path):
        scene_mp4(sid)
    n = int(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                            "stream=nb_read_frames", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip())
    want = int(round(dur * FPS))
    print(f"{sid}: {n} frames (want {want})")
    parts.append((path, want))
TOTAL = t
lst = os.path.join(SEG, "concat.txt")
with open(lst, "w") as f:
    for p, _ in parts:
        f.write(f"file '{p}'\n")
video = os.path.join(SEG, "video_only.mp4")
run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])

# 2) narration track
timings = json.load(open(os.path.join(VO, "timings.json")))
inputs, filt, labels, srt = [], [], [], []
k = 0
for sid, kind, dur, vos in edl.TIMELINE:
    for key, off in vos:
        start = starts[sid] + off
        inputs += ["-i", os.path.join(VO, f"{key}.wav")]
        ms = int(round(start * 1000))
        filt.append(f"[{k}:a]aresample=48000,adelay={ms}|{ms}[v{k}]")
        labels.append(f"[v{k}]")
        for s in timings[key]["sentences"]:
            srt.append((start + s["start"], start + s["end"], s["text"]))
        k += 1
filt.append("".join(labels) + f"amix=inputs={k}:normalize=0,apad=whole_dur={TOTAL},atrim=0:{TOTAL}[vo]")
vo_wav = os.path.join(SEG, "vo.wav")
run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filt), "-map", "[vo]", "-ac", "1", vo_wav])

# 3) mix: duck the score under the voice, then loudness-normalise
music = os.path.join(SP, "audio", "music.wav")
mix = os.path.join(SEG, "mix.wav")
fc = ("[1:a]volume=1.0,asplit=2[voa][vosc];"
      "[0:a]volume=1.1[mus];"
      "[mus][vosc]sidechaincompress=threshold=0.04:ratio=3.5:attack=20:release=500:makeup=1[duck];"
      "[voa]pan=stereo|c0=c0|c1=c0,volume=1.6[vost];"
      "[duck][vost]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]")
run(["ffmpeg", "-y", "-loglevel", "error", "-i", music, "-i", vo_wav, "-filter_complex", fc, "-map", "[out]", "-ar", "48000", mix])

# 4) mux
run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", mix, "-map", "0:v", "-map", "1:a",
     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
     "-c:a", "aac", "-b:a", "192k", "-shortest", OUT])


def ts(x):
    h, m = int(x // 3600), int(x % 3600 // 60)
    s = x % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"


with open(os.path.splitext(OUT)[0] + ".srt", "w") as f:
    for i, (a, b, txt) in enumerate(srt, 1):
        txt = txt.replace("P D F", "PDF").replace("C R M", "CRM").replace("A P I", "API").replace("I T ", "IT ").replace("I D.", "ID.").replace("info stealer", "infostealer").replace("attack techniques", "ATT&CK techniques")
        f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{txt}\n\n")
print("total", TOTAL, "->", OUT)
