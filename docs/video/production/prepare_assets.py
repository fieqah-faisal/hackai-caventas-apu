"""Builds the film's motion-graphics assets.

    python prepare_assets.py <land-110m.json> <outdir>

* logo/: the supplied Caventas lockup split into its connected components
  (icon nodes, wordmark, tagline) so the reveal can assemble the real logo.
* worldmap.json: a dot-matrix world map rasterised from the public-domain
  Natural Earth land polygons shipped in the ``world-atlas`` npm package.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

REPO = Path(__file__).resolve().parents[3]
LOGO = REPO / "frontend/src/assets/Caventas-logo.png"


def logo_layers(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    image = Image.open(LOGO).convert("RGBA")
    alpha = np.array(image)[:, :, 3]
    labels, count = ndimage.label(alpha > 8)
    parts = []
    for index, box in enumerate(ndimage.find_objects(labels), start=1):
        ys, xs = box
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if h * w < 40:
            continue
        crop = np.array(image)[ys, xs].copy()
        crop[labels[ys, xs] != index, 3] = 0
        parts.append({"x": xs.start, "y": ys.start, "w": w, "h": h, "crop": crop})
    # The icon sits above the wordmark; the tagline is the lowest row.
    icon = [p for p in parts if p["y"] + p["h"] < 1380]
    word = [p for p in parts if 1380 <= p["y"] < 1780]
    tag = [p for p in parts if p["y"] >= 1780]
    meta = {"size": image.size, "icon": [], "word": None, "tag": None}
    for i, part in enumerate(sorted(icon, key=lambda p: (p["y"], p["x"]))):
        name = f"icon-{i}.png"
        Image.fromarray(part["crop"]).save(out / name)
        meta["icon"].append({k: part[k] for k in "xywh"} | {"src": name})
    for key, group in (("word", word), ("tag", tag)):
        x0 = min(p["x"] for p in group)
        y0 = min(p["y"] for p in group)
        x1 = max(p["x"] + p["w"] for p in group)
        y1 = max(p["y"] + p["h"] for p in group)
        image.crop((x0, y0, x1, y1)).save(out / f"{key}.png")
        meta[key] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "src": f"{key}.png"}
    (out / "logo.json").write_text(json.dumps(meta, indent=1))
    print("logo parts", len(meta["icon"]), meta["word"], meta["tag"])


def _decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append((x * sx + tx, y * sy + ty))
        arcs.append(points)
    return arcs


def _ring(arcs, indexes):
    ring = []
    for i in indexes:
        points = arcs[i] if i >= 0 else list(reversed(arcs[~i]))
        ring.extend(points if not ring else points[1:])
    return ring


def world_map(topo_path: str, out: Path, cols: int = 180) -> None:
    topo = json.loads(Path(topo_path).read_text())
    arcs = _decode_arcs(topo)
    rows = cols // 2
    scale = 8
    canvas = Image.new("L", (cols * scale, rows * scale), 0)
    draw = ImageDraw.Draw(canvas)

    def project(lon, lat):
        return ((lon + 180) / 360 * cols * scale, (90 - lat) / 180 * rows * scale)

    for geometry in topo["objects"]["land"]["geometries"]:
        polygons = geometry["arcs"] if geometry["type"] == "MultiPolygon" else [geometry["arcs"]]
        for polygon in polygons:
            for k, ring in enumerate(polygon):
                draw.polygon([project(*p) for p in _ring(arcs, ring)], fill=0 if k else 255)
    grid = np.array(canvas.resize((cols, rows), Image.BOX)) > 90
    dots = [[int(x), int(y)] for y, x in zip(*np.nonzero(grid)) if y < rows * 0.86]
    (out / "worldmap.json").write_text(json.dumps({"cols": cols, "rows": rows, "dots": dots}))
    print("map dots", len(dots))


if __name__ == "__main__":
    topo, outdir = sys.argv[1:3]
    target = Path(outdir)
    logo_layers(target / "logo")
    world_map(topo, target)
