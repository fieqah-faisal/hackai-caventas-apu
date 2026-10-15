"""Procedural score, sound design and narration mix for the product film.

    python audio.py <cues.json> <vo_dir> <out.wav>

Everything is synthesised here with numpy/scipy (no samples): a D-minor score
that follows the film's acts, UI foley at the cue times the compositor
exports, and the Kokoro narration with sidechain ducking under it.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
RNG = np.random.default_rng(2026)


def note(name: str) -> float:
    names = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
             "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + names[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


def saw(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    """PolyBLEP band-limited sawtooth."""
    dt = freq / SR
    t = (phase + dt * np.arange(n)) % 1.0
    y = 2 * t - 1
    m = t < dt
    x = t[m] / dt
    y[m] -= x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt
    y[m] -= x * x + x + x + 1
    return y


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    env = np.full(n, float(s))
    a_n = min(a_n, n)
    env[:a_n] = np.linspace(0, 1, a_n, endpoint=False)
    d_end = min(n, a_n + d_n)
    env[a_n:d_end] = np.linspace(1, s, d_end - a_n, endpoint=False)
    if r_n > 0:
        r_start = max(0, n - r_n)
        env[r_start:] *= np.linspace(1, 0, n - r_start)
    return env


def lowpass(x, cutoff, order=2):
    sos = signal.butter(order, min(cutoff, SR / 2 - 100), "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def highpass(x, cutoff, order=2):
    sos = signal.butter(order, cutoff, "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR / 2 - 200)], "band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def sweep_filter(x, f0, f1, kind="band", q=0.35, block=1024):
    """Time-varying band/low-pass by blocks (risers, whooshes)."""
    out = np.zeros_like(x)
    n = len(x)
    zi = None
    for i in range(0, n, block):
        p = i / max(1, n - 1)
        fc = f0 * (f1 / f0) ** p
        if kind == "band":
            sos = signal.butter(2, [max(30, fc * (1 - q)), min(SR / 2 - 300, fc * (1 + q))], "band", fs=SR, output="sos")
        else:
            sos = signal.butter(2, min(SR / 2 - 300, fc), "low", fs=SR, output="sos")
        if zi is None or zi.shape[0] != sos.shape[0]:
            zi = signal.sosfilt_zi(sos) * 0
        out[i:i + block], zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
    return out


def reverb_ir(seconds=2.6, decay=3.2, seed=1):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-decay * t)[:, None]
    ir = lowpass(ir, 6500)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))


def reverb(x, wet=0.3, seconds=2.6, decay=3.2):
    ir = reverb_ir(seconds, decay)
    mono = x if x.ndim == 1 else x.mean(axis=1)
    tail = np.stack([signal.fftconvolve(mono, ir[:, c])[: len(mono)] for c in range(2)], axis=1)
    dry = x if x.ndim == 2 else np.stack([x, x], axis=1)
    return dry * (1 - wet) + tail * wet


class Track:
    def __init__(self, seconds: float):
        self.buf = np.zeros((int(seconds * SR) + SR * 6, 2))

    def add(self, t: float, sig: np.ndarray, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * left, sig * right], axis=1) * np.sqrt(2)
        i = int(t * SR)
        if i < 0:
            sig, i = sig[-i:], 0
        n = min(len(sig), len(self.buf) - i)
        if n > 0:
            self.buf[i:i + n] += sig[:n] * gain


# ------------------------------------------------------------- instruments --
def pad_chord(freqs, dur, bright=1400.0, attack=1.2, release=1.6):
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for k, f in enumerate(freqs):
        for c, det in enumerate((-0.07, 0.07)):
            v = saw(f * 2 ** (det / 12), n, phase=RNG.random()) + 0.5 * saw(f * 2 ** ((det * 1.7) / 12), n, phase=RNG.random())
            out[:, c] += v
    t = np.arange(n) / SR
    lfo = 1 + 0.18 * np.sin(2 * np.pi * 0.11 * t)
    out = lowpass(out * 0.12, bright) * lfo[:, None]
    out = lowpass(out, bright * 1.4)
    return out * adsr(n, attack, 0.5, 0.9, release)[:, None]


def pluck(freq, dur=0.5, bright=3200.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    v = saw(freq, n, RNG.random()) * 0.6 + 0.4 * np.sin(2 * np.pi * freq * t)
    env = np.exp(-t * 7.5)
    v = sweep_filter(v * env, bright, 380, kind="low", block=512)
    return v * adsr(n, 0.004, 0.05, 1, 0.08)


def kick(level=1.0):
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 46 + 90 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(ph) * np.exp(-t * 7.5)
    click = bandpass(RNG.standard_normal(n), 1500, 5000) * np.exp(-t * 180) * 0.12
    return np.tanh((v + click) * 1.4) * level


def hat(level=1.0, open_=False):
    n = int((0.22 if open_ else 0.07) * SR)
    t = np.arange(n) / SR
    v = highpass(RNG.standard_normal(n), 7500) * np.exp(-t * (18 if open_ else 70))
    return v * level


def boom(level=1.0, seconds=3.5):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = 38 + 50 * np.exp(-t * 6)
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.3)
    noise = lowpass(RNG.standard_normal(n), 900) * np.exp(-t * 4) * 0.35
    return np.tanh((v + noise) * 1.6) * level


def riser(seconds=3.0, level=1.0):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    v = sweep_filter(RNG.standard_normal(n), 300, 7000, kind="band", q=0.5)
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (t / seconds * 2)) / SR) * 0.15
    env = (t / seconds) ** 2.2
    return (v * 0.7 + tone) * env * level


def whoosh(seconds=0.6, level=1.0, up=True):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f0, f1 = (500, 4500) if up else (4500, 500)
    v = sweep_filter(RNG.standard_normal(n), f0, f1, kind="band", q=0.6)
    env = np.sin(np.pi * np.clip(t / seconds, 0, 1)) ** 1.5
    return v * env * level


def click(level=1.0):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    v = bandpass(RNG.standard_normal(n), 2000, 6000) * np.exp(-t * 260) + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120) * 0.4
    return v * level


def key_tick(level=1.0):
    n = int(0.035 * SR)
    t = np.arange(n) / SR
    f = RNG.uniform(2500, 4200)
    v = bandpass(RNG.standard_normal(n), f * 0.7, f * 1.3) * np.exp(-t * 300)
    return v * level


def blip(freq=1300, level=1.0, dur=0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.4 * t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32) * level


def chime(freqs=(880, 1318.5), level=1.0, gap=0.09):
    out = np.zeros(int((gap * len(freqs) + 0.8) * SR))
    for k, f in enumerate(freqs):
        n = int(0.8 * SR)
        t = np.arange(n) / SR
        v = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t * 6)
        i = int(k * gap * SR)
        out[i:i + n] += v
    return out * level


def buzz(level=1.0):
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    v = (saw(196, n) + saw(185, n)) * 0.5
    v = lowpass(v, 1400) * adsr(n, 0.005, 0.05, 0.8, 0.1)
    v[int(0.17 * SR):int(0.22 * SR)] *= 0.1
    return v * level


def glitch(level=1.0, seconds=0.3):
    n = int(seconds * SR)
    v = RNG.standard_normal(n)
    steps = np.repeat(RNG.standard_normal(n // 300 + 1), 300)[:n]
    v = np.sign(v) * (np.abs(steps) > 0.6) * 0.6 + bandpass(v, 1800, 9000) * 0.5
    v *= (np.sin(2 * np.pi * 37 * np.arange(n) / SR) > 0)
    return v * np.linspace(1, 0.2, n) * level


def data_chirps(seconds, level=1.0):
    out = np.zeros(int(seconds * SR))
    t = 0.0
    while t < seconds - 0.2:
        b = blip(RNG.uniform(1600, 3400), 1, 0.05)
        i = int(t * SR)
        out[i:i + len(b)] += b * RNG.uniform(0.3, 1)
        t += RNG.uniform(0.07, 0.22)
    hum = np.sin(2 * np.pi * 110 * np.arange(len(out)) / SR) * 0.08 * adsr(len(out), 0.3, 0.1, 1, 0.4)
    return (out * 0.35 + hum) * level


# ------------------------------------------------------------------ score ---
CHORDS = {
    "Dm9": ["D3", "A3", "C4", "E4", "F4"],
    "Bbmaj7": ["Bb2", "F3", "A3", "D4", "F4"],
    "Fadd9": ["F3", "C4", "G4", "A4", "C5"],
    "Csus": ["C3", "G3", "C4", "D4", "G4"],
    "Gm9": ["G2", "D3", "F3", "A3", "Bb3"],
    "A7sus": ["A2", "E3", "G3", "D4", "E4"],
    "Dmaj9": ["D3", "A3", "C#4", "E4", "F#4"],
}
ARP = {
    "Dm9": ["D4", "F4", "A4", "C5", "E5", "C5", "A4", "F4"],
    "Bbmaj7": ["Bb3", "D4", "F4", "A4", "D5", "A4", "F4", "D4"],
    "Fadd9": ["F4", "A4", "C5", "G5", "A5", "G5", "C5", "A4"],
    "Csus": ["C4", "G4", "C5", "D5", "G5", "D5", "C5", "G4"],
    "Gm9": ["G4", "Bb4", "D5", "F5", "A5", "F5", "D5", "Bb4"],
}


def score(cues: dict, total: float) -> np.ndarray:
    sc = {s["id"]: s for s in cues["scenes"]}
    music = Track(total)
    beat = 60 / 96
    bar = beat * 4
    t_logo = sc["s06"]["start"] + 1.45
    t_prod = sc["p01"]["start"] - 0.2
    t_drop = sc["p09"]["start"] + sc["p09"]["lineAt"]["n19"] - 0.15
    t_back = sc["p10"]["start"]
    t_close = sc["c01"]["start"]
    t_end = sc["c02"]["start"]

    # Cold open: drone, shimmer, heartbeat, rising tension
    n = int(t_logo * SR)
    t = np.arange(n) / SR
    drone = (saw(note("D2"), n) + saw(note("D2") * 1.003, n) + 0.6 * saw(note("A2"), n)) * 0.18
    drone = lowpass(drone, 260) * np.clip(t / 4, 0, 1)
    shimmer = (np.sin(2 * np.pi * note("D6") * t) + np.sin(2 * np.pi * note("Eb6") * t * 1.0005)) * 0.012 * (1 + np.sin(2 * np.pi * 0.6 * t)) * np.clip(t / 6, 0, 1)
    music.add(0, drone * 0.9, 0.8)
    music.add(0, shimmer, 0.8, pan=0.3)
    hb = sc["s01"]["start"] + 1.3
    while hb < sc["s05"]["start"] + sc["s05"]["dur"] - 0.8:
        music.add(hb, kick(0.55), 0.7)
        music.add(hb + 0.24, kick(0.35), 0.7)
        hb += 1.55
    # storm: ticking 16ths for the alert wall
    ts = sc["s04"]["start"]
    k = 0
    while ts < sc["s04"]["start"] + sc["s04"]["dur"] * 0.55:
        music.add(ts, hat(0.25 if k % 4 else 0.4), 0.6, pan=0.2 * ((-1) ** k))
        ts += beat / 4
        k += 1
    # riser into the logo hit
    music.add(t_logo - 3.0, riser(3.0), 0.55)
    music.add(t_logo, boom(1.0), 0.75)
    music.add(t_logo, reverb(np.stack([chime((note("D5"), note("A5"), note("E6")), 1.0, 0.04)] * 2, axis=1), 0.6, 3.0, 1.8), 0.25)

    # Intro pad after the hit
    music.add(t_logo + 0.1, pad_chord([note(x) for x in CHORDS["Dm9"]], t_prod - t_logo + 1.5, 1100, 1.5, 1.8), 0.7)

    # Product groove: Dm9 - Bbmaj7 - Fadd9 - Csus, two bars each
    prog_ = ["Dm9", "Bbmaj7", "Fadd9", "Csus"]
    def groove(start, end, chords, brighter=1.0, drums=True, arp=True):
        tt, i = start, 0
        while tt < end - 0.05:
            name = chords[i % len(chords)]
            seg = min(bar * 2, end - tt)
            music.add(tt, pad_chord([note(x) for x in CHORDS[name]], seg + 1.2, 1300 * brighter, 0.6, 1.0), 0.55)
            music.add(tt, np.sin(2 * np.pi * note(CHORDS[name][0]) / 2 * np.arange(int(seg * SR)) / SR) * adsr(int(seg * SR), 0.05, 0.2, 0.8, 0.3) * 0.22, 0.8)
            for b in range(int(seg / beat + 1e-6)):
                bt = tt + b * beat
                if drums:
                    if b % 2 == 0:
                        music.add(bt, kick(0.5), 0.75)
                    music.add(bt + beat / 2, hat(0.22), 0.6, pan=0.25)
                    if b % 4 == 3:
                        music.add(bt + beat * 0.75, hat(0.12), 0.6, pan=-0.25)
                if arp:
                    notes = ARP[name]
                    for h in range(2):
                        f = note(notes[(b * 2 + h) % len(notes)])
                        music.add(bt + h * beat / 2, pluck(f, 0.45, 2600 * brighter), 0.16, pan=0.35 if h else -0.35)
            tt += seg
            i += 1
    groove(t_prod, t_drop, prog_)
    # Tension: new evidence lands — drop to a pulsing low semitone
    n = int((t_back - t_drop) * SR)
    t = np.arange(n) / SR
    pulse = (saw(note("Bb1"), n) + saw(note("A1"), n) * 0.8) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * (96 / 60) * t)))
    music.add(t_drop, lowpass(pulse * 0.25, 420) * adsr(n, 0.05, 0.1, 1, 0.4), 0.8)
    music.add(t_drop, boom(0.6, 2.5), 0.5)
    music.add(t_drop, pad_chord([note(x) for x in CHORDS["Gm9"]], (t_back - t_drop) + 0.8, 800, 0.4, 0.8), 0.45)
    music.add(t_back - 1.6, riser(1.6, 0.6), 0.4)
    # Back with a brighter cycle
    groove(t_back, t_close, ["Bbmaj7", "Fadd9", "Csus", "Dm9"], brighter=1.25)
    # Close: big pads, resolve on D major for the end card
    music.add(t_close, pad_chord([note(x) for x in CHORDS["Bbmaj7"]], (t_end - t_close) / 2 + 1.0, 1700, 1.0, 1.2), 0.7)
    music.add(t_close + (t_end - t_close) / 2, pad_chord([note(x) for x in CHORDS["Csus"]], (t_end - t_close) / 2 + 1.0, 1800, 0.8, 1.2), 0.7)
    tt = t_close
    while tt < t_end - 0.1:
        music.add(tt, pluck(note("D5") if int((tt - t_close) / beat) % 2 else note("A5"), 0.6, 3000), 0.1, pan=0.3)
        tt += beat / 2
    music.add(t_end - 1.8, riser(1.8, 0.5), 0.4)
    music.add(t_end, boom(0.9, 4.5), 0.7)
    music.add(t_end, pad_chord([note(x) for x in CHORDS["Dmaj9"]], total - t_end + 2.5, 1900, 0.3, 3.0), 0.85)
    wet = reverb(music.buf, 0.22, 3.2, 2.2)
    return wet


def sfx_track(cues: dict, total: float) -> np.ndarray:
    tr = Track(total)
    for e in cues["sfx"]:
        t, kind = e["t"], e["type"]
        dur = e.get("dur", 1.0)
        if kind == "click":
            tr.add(t, click(0.5), 1, pan=0.1)
        elif kind == "typing":
            x = t
            while x < t + dur:
                tr.add(x, key_tick(0.32), 1, pan=RNG.uniform(-0.2, 0.2))
                x += RNG.uniform(0.06, 0.13)
        elif kind == "whoosh":
            tr.add(t - 0.25, whoosh(0.55, 0.22), 1)
        elif kind == "blip":
            tr.add(t, blip(1500, 0.25), 1, pan=RNG.uniform(-0.3, 0.3))
        elif kind == "zoom":
            tr.add(t, whoosh(dur, 0.12, up=True), 1)
        elif kind == "agent":
            tr.add(t, data_chirps(dur, 0.35), 1, pan=0.15)
        elif kind == "confirm":
            tr.add(t, chime((880, 1318.5), 0.18), 1)
        elif kind == "deny":
            tr.add(t, buzz(0.28), 1)
        elif kind == "alarm":
            tr.add(t, chime((1046.5, 880, 698.5), 0.16, 0.13), 1)
        elif kind == "glitch":
            tr.add(t, glitch(0.22), 1, pan=RNG.uniform(-0.4, 0.4))
        elif kind == "scroll":
            x = t
            while x < t + dur:
                tr.add(x, key_tick(0.12), 1)
                x += 0.11
        elif kind == "hit":
            tr.add(t, boom(0.5, 2.0), 1)
        elif kind == "tick":
            tr.add(t, blip(2400, 0.15, 0.04), 1)
    return reverb(tr.buf, 0.12, 1.4, 4.0)


def narration(cues: dict, vo_dir: Path, total: float):
    tr = Track(total)
    env = np.zeros(len(tr.buf))
    for c in cues["narration"]:
        audio, rate = sf.read(vo_dir / f"{c['id']}.wav")
        if rate != SR:
            audio = signal.resample_poly(audio, SR, rate)
        audio = highpass(audio, 75)
        tr.add(c["start"], audio, 1.0)
        i0 = int(c["start"] * SR)
        env[i0:i0 + len(audio)] = 1
    voice = reverb(tr.buf, 0.07, 0.9, 7.0)
    # duck envelope: 120 ms attack, 450 ms release
    a = np.exp(-1 / (0.12 * SR))
    r = np.exp(-1 / (0.45 * SR))
    smooth = np.zeros_like(env)
    level = 0.0
    for i in range(0, len(env), 64):
        target = env[i]
        coef = a if target > level else r
        level = target + (level - target) * coef ** 64
        smooth[i:i + 64] = level
    return voice, smooth


def main(cues_path: str, vo_dir: str, out: str):
    cues = json.loads(Path(cues_path).read_text())
    total = cues["total"]
    voice, duck = narration(cues, Path(vo_dir), total)
    music = score(cues, total)
    fx = sfx_track(cues, total)
    music_gain = (1 - 0.68 * duck)[:, None]
    music_bus = music * 0.42 * music_gain
    fx_bus = fx * 0.55
    speech = duck > 0.9
    db = lambda x, m: 20 * np.log10(np.sqrt(np.mean(x[m] ** 2)) + 1e-9)
    print(f"voice {db(voice, speech):.1f} dB | music under voice {db(music_bus, speech):.1f} dB | music in gaps {db(music_bus, duck < 0.1):.1f} dB | fx {db(fx_bus, np.abs(fx_bus).max(axis=1) > 1e-4):.1f} dB")
    mix = voice * 1.0 + music_bus + fx_bus
    n = int((total + 0.2) * SR)
    mix = mix[:n]
    fade = int(1.2 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    mix[: int(0.4 * SR)] *= np.linspace(0, 1, int(0.4 * SR))[:, None]
    # level by the narration, then soft-limit transients (impacts) under 0 dBFS
    target = 10 ** (-20 / 20)
    mix *= target / (np.sqrt(np.mean(voice[speech] ** 2)) + 1e-9)
    mix = np.tanh(mix * 1.15) / 1.15
    mix /= max(1.0, np.max(np.abs(mix)) / 0.94)
    sf.write(out, mix.astype(np.float32), SR, subtype="FLOAT")
    print("wrote", out, round(len(mix) / SR, 2), "s")


if __name__ == "__main__":
    main(*sys.argv[1:4])
