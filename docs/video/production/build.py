"""Assembles the compositor build directory.

    python build.py <capture_dir> <vo_dir> <assets_dir> <build_dir>

Copies the film sources and fonts, links the capture, tiles tall captures so
the browser never decodes a 30k-pixel-high image, and writes data.js.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
FONTS = REPO / "frontend/node_modules/@fontsource"
TILE_H = 576  # CSS px, matches core.js
TILE_W = 2560  # image px for a 1536 CSS px wide tile


def main(capture: Path, vo: Path, assets: Path, build: Path) -> None:
    build.mkdir(parents=True, exist_ok=True)
    for src in (HERE / "film").iterdir():
        shutil.copy(src, build / src.name)
    (build / "fonts").mkdir(exist_ok=True)
    for family, weights in (("barlow", (300, 400, 500, 600, 700, 800)), ("ibm-plex-mono", (400, 500, 600))):
        for w in weights:
            name = f"{family}-latin-{w}-normal.woff2"
            shutil.copy(FONTS / family / "files" / name, build / "fonts" / name)
    for name, target in (("capture", capture), ("assets", assets)):
        link = build / name
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(target.resolve())

    manifest = json.loads((capture / "manifest.json").read_text())
    tiles: dict[str, list[dict]] = {}
    tile_dir = capture / "tiles"
    tile_dir.mkdir(exist_ok=True)
    for name, shot in manifest["shots"].items():
        for frame in shot["frames"]:
            frame["file"] = f"capture/{frame['file']}"
        if not shot.get("tall"):
            continue
        frame = shot["frames"][0]
        css_h = shot["height"]
        if frame.get("chunks"):
            first = Image.open(capture / frame["chunks"][0]["file"])
            scale = first.width / 1536
            image = Image.new("RGB", (first.width, round(css_h * scale)))
            for chunk in frame["chunks"]:
                part = Image.open(capture / chunk["file"])
                top = 0 if chunk["offset"] == 0 else round(57 * scale)
                image.paste(part.crop((0, top, part.width, part.height)), (0, round(chunk["offset"] * scale) + top))
        else:
            image = Image.open(capture / frame["file"].removeprefix("capture/"))
            scale = image.width / 1536
        out = []
        for k, y in enumerate(range(0, css_h, TILE_H)):
            h = min(TILE_H, css_h - y)
            crop = image.crop((0, round(y * scale), image.width, round((y + h) * scale)))
            crop = crop.resize((TILE_W, round(h * TILE_W / 1536)), Image.LANCZOS)
            path = tile_dir / f"{name}-{k:02d}.jpg"
            crop.convert("RGB").save(path, quality=92)
            out.append({"y": y, "src": f"capture/tiles/{path.name}"})
        tiles[frame["file"]] = out
    manifest["pdfPages"] = [f"capture/pdf/{page}" for page in manifest.get("pdfPages", [])]
    narration = json.loads((HERE / "narration.json").read_text())
    data = {
        "durations": json.loads((vo / "durations.json").read_text()),
        "narration": narration,
        "capture": manifest,
        "tiles": tiles,
        "logo": json.loads((assets / "logo/logo.json").read_text()),
        "worldmap": json.loads((assets / "worldmap.json").read_text()),
    }
    (build / "data.js").write_text("window.FILM = " + json.dumps(data) + ";\n")
    print("tiles", sum(len(v) for v in tiles.values()), "data.js", (build / "data.js").stat().st_size)


if __name__ == "__main__":
    main(*(Path(a) for a in sys.argv[1:5]))
