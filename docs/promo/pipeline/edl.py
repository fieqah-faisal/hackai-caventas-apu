"""Edit decision list for the Caventas promo.

Footage segments use take time (seconds from the take's first frame).
Camera keys: (segment_time, css_x, css_y, zoom) in the app's 1440x810 CSS
viewport; zoom 1 shows the whole browser window.
"""
CASE = "CASE-742CD2AB"
HOST = "localhost:5173"

# Ordered master timeline: (id, kind, duration, [(vo_key, offset), ...])
TIMELINE = [
    ("S01", "scene", 23.8, [("n01", 1.3), ("n02", 12.5)]),
    ("S02", "scene", 13.8, [("n03", 0.9), ("n04", 7.6)]),
    ("F01", "footage", 10.3, [("n05", 0.3)]),
    ("F02", "footage", 5.2, [("n06", 0.2)]),
    ("F03", "footage", 7.9, [("n07", 0.2)]),
    ("S03", "scene", 6.0, [("n08", 0.3)]),
    ("S04", "scene", 17.4, [("n09", 0.4)]),
    ("F04", "footage", 8.8, [("n10", 0.3)]),
    ("F05", "footage", 11.8, [("n11", 0.3)]),
    ("F06", "footage", 8.4, [("n12", 0.3)]),
    ("X07", "footage", 9.6, [("n13", 0.3)]),
    ("X08", "footage", 6.4, [("n14", 0.3)]),
    ("T09", "scene", 6.0, [("n15", 0.2)]),
    ("F10", "footage", 13.4, [("n16", 0.3)]),
    ("T11", "scene", 4.8, [("n17", 0.2)]),
    ("F12", "footage", 12.6, [("n18", 0.3)]),
    ("S05", "scene", 3.4, [("n19", 0.5)]),
    ("S06", "scene", 11.0, [("n20", 0.6)]),
]

CH = {
    1: "01  CREATE AN INCIDENT CASE",
    2: "02  INGEST EVIDENCE",
    3: "03  RECONSTRUCT THE INCIDENT",
    5: "05  EVIDENCE-BACKED PLAN",
    6: "06  HUMAN APPROVAL",
    7: "07  CONTINUOUS REPLANNING",
    8: "08  ACCOUNTABILITY",
    9: "09  STRUCTURED REPORT",
}

def U(path=""):
    return f"/cases/{CASE}{path}"

# Each footage segment: list of subclips and camera keys / overlays.
# subclip: dict(take, src=(in, out), dur, url, chapter, [scene_png])
FOOTAGE = {
    "F01": dict(
        clips=[
            dict(take="take", src=(1.66, 11.19), dur=5.0, url="/cases/new", chapter=1),
            dict(take="take", src=(13.67, 21.07), dur=5.3, url="/cases/new", chapter=2),
        ],
        cam=[(0, 720, 405, 1.0), (1.1, 1090, 265, 1.75), (5.0, 1090, 265, 1.75), (5.4, 1085, 255, 1.85), (10.3, 1085, 255, 1.85)],
    ),
    "F02": dict(
        clips=[
            dict(take="take", src=(22.51, 26.71), dur=2.0, url="/cases/new", chapter=2),
            dict(take="take", src=(26.71, 32.2), dur=1.9, url="/cases/new", chapter=2),
            dict(take="take", src=(32.2, 36.1), dur=1.3, url=U(), chapter=2),
        ],
        cam=[(0, 1090, 330, 1.85), (2.0, 1090, 380, 1.85), (3.9, 1090, 380, 1.85), (4.5, 720, 405, 1.0), (5.2, 720, 405, 1.0)],
        callouts=[dict(kind="url", t=(3.95, 5.2), text=f"CASE ID  ·  {CASE}")],
    ),
    "F03": dict(
        clips=[
            dict(take="take", src=(37.48, 43.78), dur=3.2, url=U("/evidence"), chapter=3),
            dict(take="take", src=(43.78, 44.33), dur=1.3, url=U("/evidence"), chapter=3),
            dict(take="take", src=(46.66, 54.46), dur=3.4, url=U("/timeline"), chapter=3),
        ],
        cam=[(0, 820, 430, 1.15), (2.7, 820, 430, 1.15), (3.3, 1163, 155, 2.6), (4.5, 1163, 155, 2.6), (4.55, 760, 450, 1.35), (7.9, 760, 450, 1.35)],
        boxes=[dict(t=(3.4, 4.5), css=(1003, 232, 1436, 292), label="SHA-256 PER RECORD")],
    ),
    "F04": dict(
        clips=[
            dict(take="take", src=(67.3, 70.0), dur=2.4, url=U("/approvals"), chapter=5),
            dict(take="take", src=(70.0, 76.4), dur=6.4, url=U("/approvals"), chapter=5),
        ],
        cam=[(0, 720, 420, 1.1), (2.9, 720, 420, 1.1), (3.6, 640, 690, 1.9), (8.8, 640, 690, 1.9)],
        panels=[dict(t=(0.25, 3.2), name="plan_analysis")],
        boxes=[
            dict(t=(3.9, 8.8), css=(262, 622, 952, 719), label="WHY  ·  RATIONALE", lpos="right"),
            dict(t=(5.3, 8.8), css=(266, 750, 1135, 771), label="CITED EVIDENCE", lpos="below"),
            dict(t=(6.4, 8.8), css=(700, 727, 760, 746), label="POLICY", lpos="side"),
        ],
    ),
    "F05": dict(
        clips=[
            dict(take="take", src=(103.6, 112.0), dur=4.0, url=U("/approvals"), chapter=6),
            dict(take="take", src=(112.2, 114.2), dur=1.6, url=U("/approvals"), chapter=6),
            dict(take="take", src=(115.6, 118.6), dur=2.4, url=U("/approvals"), chapter=6),
            dict(take="take", src=(118.6, 124.2), dur=3.8, url=U("/approvals"), chapter=6),
        ],
        cam=[(0, 520, 520, 1.75), (4.0, 520, 520, 1.75), (4.01, 1250, 70, 2.6), (5.6, 1250, 70, 2.6), (5.61, 600, 640, 1.7),
             (8.0, 600, 640, 1.7), (8.6, 470, 720, 1.7), (9.6, 470, 720, 1.7), (10.2, 1250, 100, 2.5), (11.8, 1250, 100, 2.5)],
        boxes=[dict(t=(10.4, 11.8), css=(1106, 92, 1424, 140), label="SIMULATED  ·  EXECUTION ≠ VALIDATION")],
    ),
    "F06": dict(
        clips=[
            dict(take="take", src=(130.98, 136.28), dur=3.4, url=U("/approvals"), chapter=6),
            dict(take="take", src=(136.0, 139.4), dur=5.0, url=U("/approvals"), chapter=6),
        ],
        cam=[(0, 720, 405, 1.15), (1.6, 620, 330, 1.6), (3.4, 620, 330, 1.6), (3.9, 1262, 85, 2.6), (8.4, 1262, 85, 2.6)],
        boxes=[dict(t=(4.4, 8.4), css=(1106, 94, 1424, 160), label="PARTIALLY COMPLETED  ·  INEFFECTIVE", tone="warn")],
    ),
    "X07": dict(
        clips=[
            dict(scene="T07"),  # terminal: evidence upload via API (rendered scene)
            dict(take="take", src=(155.45, 164.45), dur=5.8, url=U("/timeline"), chapter=7),
        ],
        scene_dur={"T07": 3.8},
        cam=[(0, 720, 405, 1.0), (3.8, 820, 430, 1.4), (6.2, 820, 430, 1.4), (7.0, 760, 400, 1.75), (9.6, 760, 400, 1.75)],
        boxes=[dict(t=(7.2, 9.6), css=(320, 355, 1395, 456), label="SESSION REPLAY · 1,200 RECORDS EXPORTED", tone="danger")],
    ),
    "X08": dict(
        clips=[
            dict(take="take", src=(142.38, 144.06), dur=3.4, url=U("/approvals"), chapter=7),
            dict(scene="T08"),
        ],
        scene_dur={"T08": 3.0},
        cam=[(0, 720, 405, 1.05), (0.7, 1010, 450, 1.55), (3.4, 1010, 450, 1.55)],
        boxes=[dict(t=(1.0, 3.4), css=(1258, 280, 1400, 307), label="BOUND TO STATE v5 · CASE NOW AT v8", tone="warn"),
               dict(t=(1.2, 3.4), css=(1258, 600, 1400, 627), label="", tone="warn")],
    ),
    "F10": dict(
        clips=[
            dict(take="take", src=(169.47, 171.79), dur=1.6, url=U("/approvals"), chapter=8),
            dict(take="take", src=(171.79, 175.79), dur=3.8, url=U("/approvals"), chapter=8),
            dict(take="take", src=(175.89, 181.26), dur=3.6, url=U("/approvals"), chapter=8),
            dict(take="take", src=(181.62, 189.57), dur=4.4, url=U("/approvals"), chapter=8),
        ],
        cam=[(0, 600, 610, 1.6), (2.2, 600, 610, 1.6), (2.7, 1262, 75, 2.5), (5.4, 1262, 75, 2.5), (5.41, 520, 690, 1.8),
             (8.0, 520, 690, 1.8), (9.0, 720, 405, 1.15), (10.2, 720, 405, 1.15), (10.9, 1262, 100, 2.5), (13.4, 1262, 100, 2.5)],
        boxes=[
            dict(t=(0.4, 2.3), css=(285, 572, 940, 602), label="POL-02  ·  IT MANAGER REQUIRED"),
            dict(t=(3.0, 5.4), css=(1106, 18, 1424, 104), label="REFUSED BY POLICY", tone="danger"),
            dict(t=(11.75, 13.4), css=(1106, 92, 1424, 140), label="VALIDATED EFFECTIVE"),
        ],
    ),
    "F12": dict(
        clips=[
            dict(take="take3", src=(1.6, 5.3), dur=3.0, url=U("/report"), chapter=9),
            dict(take="take3", src=(10.4, 20.86), dur=4.6, url=U("/report"), chapter=9),
            dict(take="take3", src=(26.37, 34.39), dur=5.0, url=U("/report"), chapter=9),
        ],
        cam=[(0, 720, 405, 1.0), (1.4, 590, 400, 1.45), (12.6, 590, 400, 1.45)],
    ),
}
