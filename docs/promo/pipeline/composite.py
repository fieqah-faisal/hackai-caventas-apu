"""Composite recorded product footage into 1920x1080 segments.

Camera moves, a browser-window frame with the real URL, chapter tags,
highlight boxes and panels. Usage: composite.py SEG [SEG...] [--preview]
"""
import bisect
import json
import math
import os
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import edl  # noqa: E402

W, H, FPS = 1920, 1080, 30
S = 2  # bg layer supersampling
WIN_X, WIN_Y, WIN_W, BAR = 96, 34, 1728, 40
CONT_X, CONT_Y, CONT_W, CONT_H = WIN_X, WIN_Y + BAR, WIN_W, 972
CSS2C = CONT_W / 1440.0  # 1.2 canvas px per CSS px

ACCENT = (157, 237, 0)
WARN = (242, 184, 75)
DANGER = (255, 93, 93)
TONES = {"accent": ACCENT, "warn": WARN, "danger": DANGER}
FONTS = os.path.join(SP, "fonts")


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name + ".ttf"), size)


def ease(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


# ---------------------------------------------------------------- takes
@lru_cache(maxsize=None)
def take_index(take):
    rows = [json.loads(l) for l in open(os.path.join(SP, "rec", take, "frames.jsonl"))]
    t0 = rows[0]["t"]
    return [r["t"] - t0 for r in rows], [r["f"] for r in rows]


@lru_cache(maxsize=48)
def load_frame(take, fname):
    return Image.open(os.path.join(SP, "rec", take, "frames", fname)).convert("RGB")


def frame_at(take, t):
    ts, fs = take_index(take)
    i = max(bisect.bisect_right(ts, t) - 1, 0)
    return load_frame(take, fs[i])


# ---------------------------------------------------------------- bg layer
@lru_cache(maxsize=None)
def bg_layer(url):
    im = Image.new("RGB", (W * S, H * S), (6, 10, 18))
    # radial-ish gradient
    grad = Image.radial_gradient("L").resize((W * S, H * S))
    tint = Image.new("RGB", (W * S, H * S), (16, 26, 42))
    im = Image.composite(im, tint, grad)
    d = ImageDraw.Draw(im, "RGBA")
    for x in range(0, W * S, 64 * S):
        d.line([(x, 0), (x, H * S)], fill=(157, 237, 0, 10), width=1)
    for y in range(0, H * S, 64 * S):
        d.line([(0, y), (W * S, y)], fill=(157, 237, 0, 10), width=1)
    # glow + shadow behind the window
    glow = Image.new("L", (W * S, H * S), 0)
    gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle([(WIN_X - 6) * S, (WIN_Y - 2) * S, (WIN_X + WIN_W + 6) * S, (CONT_Y + CONT_H + 14) * S], 18 * S, fill=200)
    glow = glow.filter(ImageFilter.GaussianBlur(28 * S))
    im = Image.composite(Image.new("RGB", im.size, (0, 0, 0)), im, glow)
    g2 = Image.new("L", (W * S, H * S), 0)
    ImageDraw.Draw(g2).rounded_rectangle([WIN_X * S, WIN_Y * S, (WIN_X + WIN_W) * S, (CONT_Y + CONT_H) * S], 14 * S, fill=60)
    g2 = g2.filter(ImageFilter.GaussianBlur(40 * S))
    im = Image.composite(Image.new("RGB", im.size, ACCENT), im, g2.point(lambda v: v // 3))
    d = ImageDraw.Draw(im, "RGBA")
    # window body + title bar
    d.rounded_rectangle([WIN_X * S, WIN_Y * S, (WIN_X + WIN_W) * S, (CONT_Y + CONT_H) * S], 12 * S, fill=(13, 20, 33), outline=(57, 69, 88), width=S)
    d.rectangle([WIN_X * S + S, (WIN_Y + BAR - 1) * S, (WIN_X + WIN_W) * S - S, (WIN_Y + BAR) * S], fill=(43, 55, 74))
    for i, c in enumerate([(255, 93, 93), (242, 184, 75), (157, 237, 0)]):
        cx, cy = (WIN_X + 22 + i * 20) * S, (WIN_Y + BAR / 2) * S
        d.ellipse([cx - 6 * S, cy - 6 * S, cx + 6 * S, cy + 6 * S], fill=c + (170,))
    pw, ph = 620, 26
    px, py = WIN_X + WIN_W / 2 - pw / 2, WIN_Y + (BAR - ph) / 2
    d.rounded_rectangle([px * S, py * S, (px + pw) * S, (py + ph) * S], 13 * S, fill=(8, 13, 22), outline=(43, 55, 74), width=S)
    f = font("ibm-plex-mono-latin-400-normal", 13 * S)
    host, path = edl.HOST, url
    tw = d.textlength(host + path, font=f)
    tx = (px + pw / 2) * S - tw / 2
    # lock glyph
    lx, ly = tx - 18 * S, (py + 8) * S
    d.rounded_rectangle([lx, ly + 4 * S, lx + 10 * S, ly + 12 * S], 2 * S, fill=(129, 145, 173))
    d.arc([lx + 2 * S, ly, lx + 8 * S, ly + 8 * S], 180, 360, fill=(129, 145, 173), width=S + 1)
    d.text((tx, (py + 5) * S), host, font=f, fill=(129, 145, 173))
    d.text((tx + d.textlength(host, font=f), (py + 5) * S), path, font=f, fill=(236, 236, 237))
    return im


# ---------------------------------------------------------------- camera
def camera(keys, t):
    if t <= keys[0][0]:
        k = keys[0]
        return k[1], k[2], k[3]
    for a, b in zip(keys, keys[1:]):
        if a[0] <= t <= b[0]:
            if b[0] - a[0] < 0.05:
                return (b[1], b[2], b[3]) if t >= b[0] else (a[1], a[2], a[3])
            e = ease((t - a[0]) / (b[0] - a[0]))
            # interpolate zoom in log space for a natural dolly
            z = math.exp(math.log(a[3]) + (math.log(b[3]) - math.log(a[3])) * e)
            return a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, z
    k = keys[-1]
    return k[1], k[2], k[3]


def view_rect(cx, cy, z):
    X, Y = CONT_X + cx * CSS2C, CONT_Y + cy * CSS2C
    vw, vh = W / z, H / z
    x0 = min(max(X - vw / 2, 0), W - vw)
    y0 = min(max(Y - vh / 2, 0), H - vh)
    return x0, y0, vw, vh


def css_to_out(px, py, view):
    x0, y0, vw, vh = view
    z = W / vw
    return ((CONT_X + px * CSS2C - x0) * z, (CONT_Y + py * CSS2C - y0) * z)


# ---------------------------------------------------------------- overlays
def pill(d, xy, text, f, fg, bg, border, pad=(14, 8), dot=None):
    x, y = xy
    tw = d.textlength(text, font=f)
    asc, desc = f.getmetrics()
    h = asc + desc + pad[1] * 2
    extra = 18 if dot else 0
    d.rounded_rectangle([x, y, x + tw + pad[0] * 2 + extra, y + h], h / 2, fill=bg, outline=border, width=1)
    if dot:
        d.ellipse([x + pad[0], y + h / 2 - 4, x + pad[0] + 8, y + h / 2 + 4], fill=dot)
    d.text((x + pad[0] + extra, y + pad[1]), text, font=f, fill=fg)
    return tw + pad[0] * 2 + extra, h


def draw_overlays(im, seg, t, view, clip):
    d = ImageDraw.Draw(im, "RGBA")
    fm = font("ibm-plex-mono-latin-500-normal", 17)
    # chapter tag (bottom-left)
    ch = clip.get("chapter")
    if ch:
        label = edl.CH[ch]
        num, title = label.split("  ", 1)
        x, y = 30, H - 30 - 40
        tw = d.textlength(title, font=fm) + d.textlength(num + "  ", font=fm)
        d.rounded_rectangle([x, y, x + tw + 30, y + 40], 6, fill=(7, 11, 19, 225), outline=(157, 237, 0, 110), width=1)
        d.text((x + 15, y + 9), num, font=fm, fill=ACCENT)
        d.text((x + 15 + d.textlength(num + "  ", font=fm), y + 9), title, font=fm, fill=(236, 236, 237))
    # footage chip (bottom-right)
    fs = font("ibm-plex-mono-latin-500-normal", 14)
    txt = "REAL PRODUCT FOOTAGE · SYNTHETIC INCIDENT DATA"
    tw = d.textlength(txt, font=fs)
    blink = 0.55 + 0.45 * math.sin(t * 4)
    pill(d, (W - 30 - tw - 46, H - 30 - 34), txt, fs, (186, 197, 215), (7, 11, 19, 225), (57, 69, 88, 255), pad=(14, 8), dot=(157, 237, 0, int(255 * blink)))
    # highlight boxes
    for b in seg.get("boxes", []):
        t0, t1 = b["t"]
        if not (t0 <= t <= t1):
            continue
        a = ease((t - t0) / 0.3) * (1 - ease((t - (t1 - 0.15)) / 0.15) if t1 - t < 0.15 else 1)
        col = TONES[b.get("tone", "accent")]
        (x0, y0), (x1, y1) = css_to_out(b["css"][0], b["css"][1], view), css_to_out(b["css"][2], b["css"][3], view)
        grow = (1 - ease((t - t0) / 0.3)) * 10
        x0, y0, x1, y1 = x0 - 6 - grow, y0 - 5 - grow, x1 + 6 + grow, y1 + 5 + grow
        glow = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle([x0, y0, x1, y1], 8, outline=col + (int(170 * a),), width=7)
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(6)))
        d = ImageDraw.Draw(im, "RGBA")
        d.rounded_rectangle([x0, y0, x1, y1], 8, outline=col + (int(255 * a),), width=3)
        if b.get("label"):
            fl = font("ibm-plex-mono-latin-600-normal", 16)
            lw = d.textlength(b["label"], font=fl)
            pos = b.get("lpos", "above")
            ly = y0 - 34 if y0 - 34 > 8 else y1 + 8
            lx = min(max(x0, 12), W - lw - 40)
            if pos == "right":
                lx = min(max(x1 - lw - 22, 12), W - lw - 40)
            elif pos == "below":
                ly = y1 + 8
            elif pos == "side":
                lx, ly = min(x1 + 10, W - lw - 40), (y0 + y1) / 2 - 14
            d.rounded_rectangle([lx, ly, lx + lw + 22, ly + 28], 5, fill=col + (int(240 * a),))
            d.text((lx + 11, ly + 5), b["label"], font=fl, fill=(10, 14, 22, int(255 * a)))
    # callouts
    for c in seg.get("callouts", []):
        t0, t1 = c["t"]
        if not (t0 <= t <= t1):
            continue
        a = ease((t - t0) / 0.3)
        if c["kind"] == "url":
            ux, uy = css_to_url(view)
            fl = font("ibm-plex-mono-latin-600-normal", 22)
            lw = d.textlength(c["text"], font=fl)
            bx, by = ux - (lw + 36) / 2, uy + 44 + (1 - a) * 12
            d.line([(ux, uy + 16), (ux, by)], fill=ACCENT + (int(255 * a),), width=2)
            d.rounded_rectangle([bx, by, bx + lw + 36, by + 46], 8, fill=(7, 11, 19, int(235 * a)), outline=ACCENT + (int(255 * a),), width=2)
            d.text((bx + 18, by + 10), c["text"], font=fl, fill=ACCENT + (int(255 * a),))
    # panels
    for p in seg.get("panels", []):
        t0, t1 = p["t"]
        if not (t0 <= t <= t1):
            continue
        a = min(ease((t - t0) / 0.3), ease((t1 - t) / 0.3))
        dim = Image.new("RGBA", im.size, (4, 7, 13, int(150 * a)))
        im.alpha_composite(dim)
        pim = panel_png(p["name"])
        if a < 1:
            pim = pim.copy()
            pim.putalpha(pim.getchannel("A").point(lambda v: int(v * a)))
        im.alpha_composite(pim)


def css_to_url(view):
    x0, y0, vw, vh = view
    z = W / vw
    return ((WIN_X + WIN_W / 2 - x0) * z, (WIN_Y + BAR / 2 - y0) * z)


@lru_cache(maxsize=None)
def panel_png(name):
    return Image.open(os.path.join(HERE, "panels", name + ".png")).convert("RGBA")


# ---------------------------------------------------------------- render
SEG = None
PLAN = None


def build_plan(seg_id):
    seg = edl.FOOTAGE[seg_id]
    plan, t = [], 0.0
    for c in seg["clips"]:
        dur = c["dur"] if "dur" in c else seg["scene_dur"][c["scene"]]
        plan.append((t, t + dur, c))
        t += dur
    return seg, plan, t


def init(seg_id):
    global SEG, PLAN
    SEG, PLAN, _ = build_plan(seg_id)


def render(i):
    t = i / FPS
    clip = PLAN[-1]
    for start, end, c in PLAN:
        if start <= t < end:
            clip = (start, end, c)
            break
    start, end, c = clip
    if "scene" in c:
        k = int(round((t - start) * FPS))
        path = os.path.join(HERE, "scenes", c["scene"], f"{k:05d}.png")
        if not os.path.exists(path):
            k = len(os.listdir(os.path.join(HERE, "scenes", c["scene"]))) - 1
            path = os.path.join(HERE, "scenes", c["scene"], f"{k:05d}.png")
        return Image.open(path).convert("RGB").tobytes()
    src_t = c["src"][0] + (t - start) / (end - start) * (c["src"][1] - c["src"][0])
    frame = frame_at(c["take"], src_t)
    cx, cy, z = camera(SEG["cam"], t)
    view = view_rect(cx, cy, z)
    x0, y0, vw, vh = view
    bb = (max(x0 * S, 0), max(y0 * S, 0), min((x0 + vw) * S, W * S), min((y0 + vh) * S, H * S))
    out = bg_layer(c["url"]).resize((W, H), Image.BICUBIC, box=bb)
    # content: integer destination box, exact inverse-mapped source box
    zz = W / vw
    ix0, iy0 = max(x0, CONT_X), max(y0, CONT_Y)
    ix1, iy1 = min(x0 + vw, CONT_X + CONT_W), min(y0 + vh, CONT_Y + CONT_H)
    if ix1 > ix0 and iy1 > iy0:
        dx0, dy0 = round((ix0 - x0) * zz), round((iy0 - y0) * zz)
        dx1, dy1 = round((ix1 - x0) * zz), round((iy1 - y0) * zz)
        sx = lambda dx: ((dx / zz + x0) - CONT_X) / CSS2C * 2  # noqa: E731
        sy = lambda dy: ((dy / zz + y0) - CONT_Y) / CSS2C * 2  # noqa: E731
        fw, fh = frame.size
        sb = (max(sx(dx0), 0), max(sy(dy0), 0), min(sx(dx1), fw), min(sy(dy1), fh))
        crop = frame.resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS, box=sb)
        out.paste(crop, (dx0, dy0))
    out = out.convert("RGBA")
    draw_overlays(out, SEG, t, view, c)
    return out.convert("RGB").tobytes()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preview = "--preview" in sys.argv
    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    for seg_id in args:
        _, plan, total = build_plan(seg_id)
        n = int(round(total * FPS))
        frames = range(0, n, 10) if preview else range(n)
        outp = os.path.join(HERE, "out", f"{seg_id}{'_preview' if preview else ''}.mp4")
        ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                               "-r", str(FPS if not preview else 3), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                               "-crf", "14" if not preview else "23", "-pix_fmt", "yuv420p", outp], stdin=subprocess.PIPE)
        with Pool(4, initializer=init, initargs=(seg_id,)) as pool:
            for buf in pool.imap(render, frames, chunksize=4):
                ff.stdin.write(buf)
        ff.stdin.close()
        ff.wait()
        print(seg_id, n, "frames ->", outp)


if __name__ == "__main__":
    main()
