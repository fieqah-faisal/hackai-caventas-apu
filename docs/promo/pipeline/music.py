"""Original synthesized score + sound design for the Caventas promo.

All sound is generated here (no samples). Timed to edit/edl.py.
Writes music.wav (score + SFX) at 48 kHz stereo.
"""
import sys
import numpy as np
from scipy import signal
import soundfile as sf

SR = 48000
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 180.6
OUT = sys.argv[1]
N = int(DUR * SR)
rng = np.random.default_rng(42)
L = np.zeros(N); R = np.zeros(N)

BPM = 92.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT


def nf(note):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    n, o = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def add(buf_l, buf_r, x, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    if i >= N or i + len(x) <= 0:
        return
    if i < 0:
        x = x[-i:]; i = 0
    x = x[: N - i]
    lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf_l[i:i + len(x)] += x * gain * lg * 1.414
    buf_r[i:i + len(x)] += x * gain * rg * 1.414


def env(n, a, d, s, r, sustain_len=None):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sl = (n - a - d - r) if sustain_len is None else int(sustain_len * SR)
    sl = max(sl, 0)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sl, s), np.linspace(s, 0, max(r, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (f * (1 + detune) * t + rng.random()) % 1.0
    return 2 * ph - 1


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc / (SR / 2), 0.99), 'low')
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def bp(x, f1, f2):
    b, a = signal.butter(2, [f1 / (SR / 2), f2 / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


# ------------------------------------------------------------ instruments
def pad(notes, t0, dur, gain=0.08, cutoff=1400, attack=1.2, release=1.8):
    n = int((dur + release) * SR)
    x = np.zeros(n)
    for note in notes:
        f = nf(note)
        for dt in (-0.006, 0.0, 0.0065):
            x += saw(f, n, dt)
    x = lp(x, cutoff, 2) / (len(notes) * 3)
    x *= env(n, attack, 0.5, 0.85, release, sustain_len=dur - attack - 0.5)
    add(L, R, x, t0, -0.25, gain * 1.35)
    add(L, R, np.roll(x, 480), t0, 0.25, gain * 1.35)


def sub(note, t0, dur, gain=0.22):
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * nf(note) * t) * env(n, 0.3, 0.2, 0.9, 0.4, sustain_len=dur - 0.5)
    add(L, R, x, t0, 0, gain * 0.55)


def bass(note, t0, dur, gain=0.16):
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    f = nf(note)
    x = 0.7 * np.sin(2 * np.pi * f * t) + 0.3 * lp(saw(f, n), 600)
    x *= env(n, 0.005, 0.12, 0.6, 0.08, sustain_len=dur - 0.2)
    add(L, R, x, t0, 0, gain * 0.8)


def kick(t0, gain=0.5):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    add(L, R, x, t0, 0, gain)


def hat(t0, gain=0.05, open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    x = hp(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR * (14 if open_ else 70))
    add(L, R, x, t0, 0.35, gain)


def pluck(note, t0, gain=0.05, pan=0.0, cutoff=2600):
    n = int(0.9 * SR)
    f = nf(note)
    x = (saw(f, n) + 0.5 * saw(f * 2, n, 0.003))
    x = lp(x, cutoff) * np.exp(-np.arange(n) / SR * 5.5)
    add(L, R, x, t0, pan, gain * 1.5)


def boom(t0, gain=0.6):
    n = int(3.5 * SR)
    t = np.arange(n) / SR
    f = 32 + 60 * np.exp(-t * 6)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    nz = lp(rng.standard_normal(n), 900) * np.exp(-t * 4) * 0.5
    add(L, R, x + nz, t0, 0, gain)


def riser(t0, dur, gain=0.18, f0=300, f1=6000):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 2048
    for i in range(0, n, blk):
        k = i / n
        fc = f0 * (f1 / f0) ** k
        b, a = signal.butter(2, [max(fc * 0.7, 40) / (SR / 2), min(fc * 1.3, 20000) / (SR / 2)], 'band')
        out[i:i + blk] = signal.lfilter(b, a, x[i:i + blk])
    out *= np.linspace(0, 1, n) ** 2
    add(L, R, out, t0, -0.2, gain)
    add(L, R, out[::-1][::-1], t0 + 0.01, 0.2, gain)


def whoosh(t0, dur=0.9, gain=0.16):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 1024
    for i in range(0, n, blk):
        k = i / n
        fc = 400 + 5000 * np.sin(np.pi * k)
        b, a = signal.butter(2, [fc * 0.6 / (SR / 2), min(fc * 1.6, 20000) / (SR / 2)], 'band')
        out[i:i + blk] = signal.lfilter(b, a, x[i:i + blk])
    out *= np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    add(L, R, out, t0, -0.4, gain)
    add(L, R, out, t0 + 0.02, 0.4, gain)


def tick(t0, gain=0.07):
    n = int(0.03 * SR)
    x = bp(rng.standard_normal(n), 2500, 6000) * np.exp(-np.arange(n) / SR * 160)
    add(L, R, x, t0, 0.1, gain)


def blip(t0, f=1800, gain=0.05, dur=0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 40)
    add(L, R, x, t0, 0.2, gain)


def glitch(t0, gain=0.12):
    for k in range(6):
        n = int(rng.uniform(0.015, 0.05) * SR)
        x = bp(rng.standard_normal(n), 800, 8000) * 0.8
        x = np.sign(x) * np.abs(x) ** 0.5
        add(L, R, x, t0 + k * 0.045, rng.uniform(-0.7, 0.7), gain)


# ------------------------------------------------------------ score
# Section A: cold open 0 - 23.8 (dark, tension)
sub('A1', 0.0, 12.3, 0.14)
pad(['A2', 'E3', 'C4'], 0.2, 12.0, 0.038, 700, attack=3.0)
for s in range(1, 12):
    tick(s * 1.0, 0.06)
boom(6.5, 0.22); glitch(6.5, 0.07)
whoosh(9.4, 1.6, 0.14)
# morning: pulse and build
sub('A1', 12.4, 11.0, 0.13)
pad(['A2', 'E3', 'G3', 'C4'], 12.4, 10.8, 0.042, 900, attack=1.5)
t = 12.5
while t < 23.3:
    bass('A1', t, BEAT / 2 * 0.9, 0.10 + 0.08 * (t - 12.5) / 10.8)
    if t > 15.0:
        hat(t + BEAT / 4, 0.025)
    t += BEAT / 2
for k in range(int(20.6 / BEAT), int(23.3 / BEAT)):
    kick(k * BEAT, 0.25)
riser(20.4, 3.2, 0.16)
glitch(23.0, 0.10)

# Section B: brand 23.8 - 37.6
boom(24.1, 0.45)
whoosh(23.6, 0.7, 0.12)
prog_b = [(['A2', 'E3', 'A3', 'C4'], 'A1'), (['F2', 'C3', 'F3', 'A3'], 'F1'), (['C3', 'G3', 'C4', 'E4'], 'C2'), (['G2', 'D3', 'G3', 'B3'], 'G1')]
tb = 24.1
for i, (ch, root) in enumerate(prog_b * 1):
    pad(ch, tb + i * 3.4, 3.6, 0.07, 1600, attack=0.8, release=1.6)
    sub(root, tb + i * 3.4, 3.4, 0.14)
for k in range(16):
    pluck(['A4', 'C5', 'E5', 'A5'][k % 4], 26.0 + k * BEAT / 2, 0.025, pan=(-0.4 if k % 2 else 0.4))

# Section C: product groove 37.6 - 113.4
def groove(t0, t1, chords, level=1.0, hats=True, arp=True):
    t = t0
    i = 0
    while t < t1 - 0.05:
        ch, root = chords[i % len(chords)]
        bar_end = min(t + BAR, t1)
        pad(ch, t, bar_end - t, 0.05 * level, 1500, attack=0.4, release=1.0)
        for b in range(4):
            bt = t + b * BEAT
            if bt >= t1:
                break
            if b in (0, 2):
                kick(bt, 0.22 * level)
            bass(root, bt, BEAT * 0.85, 0.11 * level)
            if hats:
                hat(bt + BEAT / 2, 0.022 * level)
            if arp and b % 2 == 1:
                pluck(ch[(b + i) % len(ch)].replace('2', '4').replace('3', '4'), bt + BEAT / 4, 0.018 * level, pan=0.3)
        t += BAR
        i += 1


C_PROG = [(['A2', 'E3', 'A3', 'C4'], 'A1'), (['F2', 'C3', 'F3', 'A3'], 'F1'), (['C3', 'G3', 'C4', 'E4'], 'C2'), (['G2', 'D3', 'G3', 'B3'], 'G1')]
groove(37.6, 61.0, C_PROG, 0.9)
# graph + pipeline: lighter, more airy (no kick in first bars)
pad(['A2', 'E3', 'B3', 'C4'], 61.0, 6.0, 0.06, 1800, attack=0.6)
sub('A1', 61.0, 6.0, 0.12)
groove(67.0, 84.4, C_PROG, 0.85, hats=True, arp=True)
for k in range(12):
    blip(67.0 + 2.3 + k * 1.15, 1500 + 120 * (k % 5), 0.02)
groove(84.4, 113.4, C_PROG, 0.95)

# Section D: new evidence / tension 113.4 - 135.4
boom(113.4, 0.28); glitch(113.4, 0.07); whoosh(113.1, 0.6, 0.1)
D_PROG = [(['A2', 'E3', 'A3', 'C4'], 'A1'), (['G2', 'D3', 'G3', 'B3'], 'G1'), (['F2', 'C3', 'F3', 'A3'], 'F1'), (['E2', 'B2', 'E3', 'G#3'], 'E1')]
groove(113.4, 135.4, D_PROG, 1.0)
t = 113.4
while t < 135.3:
    pluck('A4' if int((t - 113.4) / (BEAT / 2)) % 4 else 'E5', t, 0.014, pan=-0.3, cutoff=1800)
    t += BEAT / 2
blip(125.6, 600, 0.05, 0.25)  # the 409

# Section E: accountability + report 135.4 - 166.2
E_PROG = [(['F2', 'C3', 'F3', 'A3'], 'F1'), (['C3', 'G3', 'C4', 'E4'], 'C2'), (['G2', 'D3', 'G3', 'B3'], 'G1'), (['A2', 'E3', 'A3', 'C4'], 'A1')]
groove(135.4, 166.2, E_PROG, 0.95)
riser(163.6, 2.6, 0.10, 400, 5000)

# Section F: ending 166.2 - end
whoosh(166.0, 0.6, 0.12)
pad(['F2', 'C3', 'F3', 'A3', 'C4'], 166.2, 3.4, 0.07, 2200, attack=0.3)
sub('F1', 166.2, 3.4, 0.14)
pad(['A2', 'E3', 'A3', 'C4', 'E4'], 169.6, 4.0, 0.06, 1800, attack=0.6)
sub('A1', 169.6, 4.0, 0.14)
for k in range(8):
    pluck(['A4', 'C5', 'E5', 'G5'][k % 4], 170.0 + k * BEAT / 2, 0.02, pan=(-0.4 if k % 2 else 0.4))
pad(['F2', 'C3', 'A3', 'C4', 'E4'], 173.6, 3.6, 0.065, 2000, attack=0.6)
sub('F1', 173.6, 3.6, 0.14)
boom(177.9, 0.5)
pad(['C3', 'G3', 'C4', 'E4', 'G4'], 177.9, 1.0, 0.08, 2600, attack=0.05, release=2.4)
sub('C2', 177.9, 1.2, 0.15)

# ------------------------------------------------------------ reverb + master
def reverb(x, secs=2.4, mix=0.22):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2)
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = signal.fftconvolve(x, ir)[: len(x)]
    return x * (1 - mix) + wet * mix


L = reverb(hp(L, 32)); R = reverb(hp(R, 32))
st = np.stack([L, R], axis=1)
st /= max(np.abs(st).max(), 1e-9)
st *= 0.8
fade = int(1.2 * SR)
st[-fade:] *= np.linspace(1, 0, fade)[:, None]
sf.write(OUT, st.astype(np.float32), SR)
print('wrote', OUT, st.shape[0] / SR, 's')
