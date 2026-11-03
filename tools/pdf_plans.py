"""Build src/maket/plans.js from the cadastral plan set (chizma.pdf, via the primitives pdf_extract.py pulled out).
python tools/pdf_plans.py <pdf.pkl> <out dir>
Every sheet is moved onto the maket's frame by two facts the dimensions give: the east face of the main block
(x = +24.55) and its back face (z = -7.05); the main block is 42.40 x 14.10 m and the wing 6.70 m on its west end.
Then the strokes are rasterised on the 0.1 m grid the interiors use: wall faces closed into walls, door leaves and
arcs only seal rooms while they are found, glazing on the facade becomes windows, stair treads and lift shafts
become the stair blobs.  Rooms get the number and area of the cadastral schedule by matching areas."""
import sys, json, math, pickle
import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1:3]
PAGES = pickle.load(open(SRC, 'rb'))
XE, ZBK = 24.55, -7.05                       # east face and back face of the main block on the maket
ZF_ = 7.05                                   # its street face
CELL, F = 0.1, 4                             # 0.1 m grid, strokes drawn at 2.5 cm and pooled
# key: sheet, east face and back face of the main block on that sheet (metres, sheet frame)
CFG = {'b': (1, 52.89, 15.28), '1': (2, 58.14, 24.43), '2': (3, 53.14, 13.69), '3': (4, 52.82, 14.84),
       '6': (5, 53.23, 14.09), '7': (6, 53.72, 14.30), '9': (8, 52.31, 13.41), '10': (9, 66.53, 11.64)}
# goods lift at the east end, between the 1st floor (logistics hall) and the basement (maket frame)
FREIGHT = {}
# cadastral schedules: room number -> area (m²)
SCHED = {
    'b': {1: 32.17, 2: 32.17, 3: 28.02, 4: 22.82, 5: 25.20, 6: 44.80, 7: 8.20, 8: 33.19, 9: 14.34, 10: 6.56, 11: 44.24,
          12: 31.35, 13: 161.24, 14: 31.36, 15: 14.56, 16: 60.44, 17: 5.46},
    '1': {1: 43.11, 2: 36.51, 3: 52.44, 4: 79.73, 5: 67.84, 6: 76.18, 7: 83.49, 8: 80.58, 9: 85.73, 10: 19.16, 11: 5.0,
          12: 45.42, 13: 9.56},
    '2': {1: 36.38, 2: 45.08, 3: 4.92, 4: 15.13, 5: 7.10, 6: 24.91, 7: 4.20, 8: 4.30, 9: 4.20, 10: 15.45, 11: 7.20,
          12: 4.20, 13: 20.71, 14: 7.20, 15: 4.20, 16: 20.71, 17: 41.98, 18: 7.20, 19: 4.20, 20: 20.71, 21: 7.20, 22: 4.20,
          23: 20.29, 24: 6.40, 25: 79.83, 27: 31.15, 29: 4.15, 30: 7.20, 31: 19.14, 32: 4.16, 33: 4.20, 34: 16.46,
          35: 46.06, 36: 4.16, 37: 46.35},
    '3': {1: 36.38, 2: 45.08, 3: 4.80, 4: 15.13, 5: 3.94, 6: 6.80, 7: 20.15, 8: 4.20, 9: 4.20, 10: 4.20, 11: 15.31,
          12: 7.20, 13: 4.60, 14: 20.89, 15: 85.73, 16: 7.20, 17: 3.80, 18: 20.54, 19: 7.20, 20: 4.20, 21: 20.71, 22: 7.50,
          23: 4.20, 24: 20.85, 25: 6.40, 26: 6.80, 27: 16.33, 28: 18.48, 29: 4.20, 30: 7.20, 31: 4.16, 32: 19.01, 33: 7.15,
          34: 19.01, 35: 4.20, 36: 7.20, 37: 4.15, 38: 19.14, 39: 4.55, 40: 17.16, 41: 4.15, 42: 44.95, 43: 4.19},
    '6': {1: 36.38, 2: 45.08, 3: 4.80, 4: 15.13, 5: 3.95, 6: 6.80, 7: 20.16, 8: 4.20, 9: 4.20, 10: 4.20, 11: 15.31,
          12: 7.20, 13: 4.60, 14: 20.90, 15: 72.53, 16: 7.20, 17: 3.80, 18: 20.53, 19: 7.20, 20: 4.20, 21: 20.71, 22: 7.50,
          23: 4.20, 24: 20.85, 25: 6.40, 26: 6.80, 27: 16.33, 28: 18.48, 29: 4.20, 30: 7.20, 31: 4.16, 32: 19.01, 33: 7.15,
          34: 19.01, 35: 4.20, 36: 7.20, 37: 4.15, 38: 19.14, 39: 4.55, 40: 17.16, 41: 4.15, 42: 44.95, 43: 4.19, 44: 12.65},
    '7': {1: 36.38, 2: 45.08, 3: 4.81, 4: 15.13, 5: 3.95, 6: 6.80, 7: 20.15, 8: 4.20, 9: 45.16, 10: 4.19, 11: 4.20,
          12: 4.20, 13: 15.31, 14: 4.55, 15: 4.15, 16: 17.16, 17: 7.20, 18: 20.89, 19: 4.60, 20: 7.20, 21: 4.15, 22: 19.14,
          23: 85.73, 24: 7.20, 25: 3.80, 26: 20.53, 27: 7.15, 28: 4.20, 29: 19.01, 30: 7.20, 31: 20.71, 32: 4.20, 33: 7.20,
          34: 19.01, 35: 4.16, 36: 7.50, 37: 4.20, 38: 20.85, 39: 6.40, 40: 6.80, 41: 4.20, 42: 18.48, 43: 16.33},
    '9': {1: 36.68, 2: 45.08, 3: 24.35, 4: 32.90, 5: 49.34, 6: 24.35, 7: 25.68, 8: 25.85, 9: 23.23, 10: 24.36, 11: 22.52,
          12: 25.11, 13: 22.52, 14: 68.01, 15: 66.44},
    '10': {1: 17.77, 2: 46.11, 3: 16.32, 4: 4.86, 5: 8.64, 6: 27.19, 7: 2.43, 8: 26.40, 9: 11.62, 10: 20.37, 11: 3.97,
           12: 33.74, 13: 3.99, 14: 46.95},
}

# --- small morphology on boolean grids ---
def boxsum(a, k):
    r = k // 2; p = np.pad(a.astype(np.int32), ((r + 1, r), (r + 1, r))); c = p.cumsum(0).cumsum(1)
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
dil = lambda a, k: boxsum(a, k) > 0
ero = lambda a, k: boxsum(a, k) == k * k
close = lambda a, k: ero(dil(a, k), k)
def components(mask):
    h, w = mask.shape; lab = np.zeros((h, w), np.int32); n = 0
    for y0 in range(h):
        for x0 in range(w):
            if mask[y0, x0] and not lab[y0, x0]:
                n += 1; st = [(y0, x0)]; lab[y0, x0] = n
                while st:
                    y, x = st.pop()
                    for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st.append((yy, xx))
    return lab, n
def thin(mask):
    """Zhang-Suen thinning to a one-cell centre line, then diagonal steps filled so it stays 4-connected"""
    img = mask.astype(np.uint8)
    while True:
        changed = False
        for step in (0, 1):
            P = np.pad(img, 1)
            p2, p3, p4, p5 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:], P[2:, 2:]
            p6, p7, p8, p9 = P[2:, 1:-1], P[2:, :-2], P[1:-1, :-2], P[:-2, :-2]
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            A = sum(((seq[k] == 0) & (seq[k + 1] == 1)).astype(np.uint8) for k in range(8))
            c = ((p2 * p4 * p6) == 0) & ((p4 * p6 * p8) == 0) if step == 0 else ((p2 * p4 * p8) == 0) & ((p2 * p6 * p8) == 0)
            m = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if m.any(): img[m] = 0; changed = True
        if not changed: break
    s = img.astype(bool)
    d1 = s[:-1, :-1] & s[1:, 1:] & ~s[:-1, 1:] & ~s[1:, :-1]; s[:-1, 1:] |= d1
    d2 = s[:-1, 1:] & s[1:, :-1] & ~s[:-1, :-1] & ~s[1:, 1:]; s[:-1, :-1] |= d2
    return s
def rects(mask):
    h, w = mask.shape; used = np.zeros_like(mask); out = []
    for y in range(h):
        x = 0
        while x < w:
            if mask[y, x] and not used[y, x]:
                x1 = x
                while x1 < w and mask[y, x1] and not used[y, x1]: x1 += 1
                y1 = y + 1
                while y1 < h and mask[y1, x:x1].all() and not used[y1, x:x1].any(): y1 += 1
                used[y:y1, x:x1] = True; out.append((x, y, x1, y1)); x = x1
            else: x += 1
    return out
def grow(grid, walk, n=40):
    for _ in range(n):
        z = (grid == 0) & walk
        if not z.any(): break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(grid, (dy, dx), (0, 1)); m = z & (grid == 0) & (sh > 0); grid[m] = sh[m]
def outline_of(inside, gx0, gz0):
    """rectilinear outline (largest component) as a list of corner points, metres"""
    lab, n = components(inside)
    if n > 1:
        big = np.argmax(np.bincount(lab.ravel())[1:]) + 1; inside = lab == big
    h, w = inside.shape; P = np.pad(inside, 1); E = {}
    for j, i in zip(*np.nonzero(P)):                # boundary edges, walked with the inside on one hand
        if not P[j - 1, i]: E[(i, j)] = (i + 1, j)
        if not P[j + 1, i]: E[(i + 1, j + 1)] = (i, j + 1)
        if not P[j, i - 1]: E[(i, j + 1)] = (i, j)
        if not P[j, i + 1]: E[(i + 1, j)] = (i + 1, j + 1)
    start = min(E); pts = [start]; cur = E[start]
    while cur != start: pts.append(cur); cur = E[cur]
    out = []
    for k, p in enumerate(pts):                     # keep corners only
        a, b = pts[k - 1], pts[(k + 1) % len(pts)]
        if (p[0] - a[0], p[1] - a[1]) != (b[0] - p[0], b[1] - p[1]): out.append(p)
    return [[round(gx0 + (int(i) - 1) * CELL, 2), round(gz0 + (int(j) - 1) * CELL, 2)] for i, j in out]

def stair_flights(segs):
    """runs of >= 5 parallel strokes of equal span, 0.15-0.45 m apart: treads of a flight -> rects (sheet frame)"""
    out = []
    for o in 'hv':
        S = []
        for s in segs:
            if o == 'h' and abs(s[1] - s[3]) < 0.02: S.append((s[1], min(s[0], s[2]), max(s[0], s[2]), s))
            if o == 'v' and abs(s[0] - s[2]) < 0.02: S.append((s[0], min(s[1], s[3]), max(s[1], s[3]), s))
        S = [t for t in S if 0.7 < t[2] - t[1] < 1.9]; S.sort()
        used = set()
        for i, (c, lo, hi, s) in enumerate(S):
            if i in used: continue
            run = [i]; last = c
            for j in range(i + 1, len(S)):
                c2, lo2, hi2, _ = S[j]
                if c2 - last > 0.45: break
                if 0.15 < c2 - last and abs(lo2 - lo) < 0.15 and abs(hi2 - hi) < 0.15: run.append(j); last = c2
            if len(run) >= 5:
                used.update(run)
                c0, c1 = S[run[0]][0], S[run[-1]][0]
                out.append(((lo, c0, hi, c1) if o == 'h' else (c0, lo, c1, hi), {S[k][3] for k in run}, 'z' if o == 'h' else 'x'))   # flight runs across its treads
    return out

result = {}
for key, (pno, E, BK) in CFG.items():
    pg = PAGES[pno - 1]
    dx, dz = XE - E, ZBK - BK
    M = lambda x, z: (x + dx, z + dz)
    heavy, thin_s, fine = pg['heavy'], pg['thin'], pg['fine']
    axisok = lambda s: abs(s[0] - s[2]) < 0.02 or abs(s[1] - s[3]) < 0.02
    L = lambda s: math.hypot(s[2] - s[0], s[3] - s[1])
    diag = [s for s in heavy + thin_s if not axisok(s)]
    lifts = sorted({(round(min(s[0], s[2]), 2), round(min(s[1], s[3]), 2), round(max(s[0], s[2]), 2), round(max(s[1], s[3]), 2)) for s in diag if L(s) > 1.5})   # both diagonals of the X
    arcs = [s for s in diag if L(s) <= 1.5]
    flights = stair_flights([s for s in thin_s + fine + heavy if axisok(s)])
    treads = set().union(*[f[1] for f in flights]) if flights else set()
    # a wall is drawn as two faces; a single thin stroke is a dimension or extension line (or a leader) the
    # tick filter missed, and must not stand in the room. Short strokes stay: they are the end caps of walls.
    def ax2(s):
        return ('h', s[1], min(s[0], s[2]), max(s[0], s[2])) if abs(s[1] - s[3]) < 0.02 else ('v', s[0], min(s[1], s[3]), max(s[1], s[3]))
    faces_ = [ax2(t) for t in heavy + thin_s if axisok(t) and t not in treads]
    def paired(s):
        o, c, lo, hi = ax2(s)
        if hi - lo < 0.35: return True
        return any(o2 == o and 0.05 < abs(c2 - c) < 0.45 and min(hi, hi2) - max(lo, lo2) > 0.4 * (hi - lo) for o2, c2, lo2, hi2 in faces_)
    # ...but only inside the building: on some sheets the outer walls themselves are single strokes
    G_ = pg['G']; outer_ = boxsum(~pg['inside'], 25) > 0                      # within 0.6 m of the outside
    def at_edge(s):
        for t in (0.25, 0.5, 0.75):
            i, j = int((s[0] + (s[2] - s[0]) * t) / G_), int((s[1] + (s[3] - s[1]) * t) / G_)
            if not (0 <= j < outer_.shape[0] and 0 <= i < outer_.shape[1]) or outer_[j, i]: return True
        return False
    # a partition drawn as one line still runs wall to wall; an extension or dimension line has a loose end
    others_ = [t for t in heavy + thin_s if axisok(t) and t not in treads] +               [e for q in pg['cols'] for e in ((q[0], q[1], q[2], q[1]), (q[2], q[1], q[2], q[3]), (q[2], q[3], q[0], q[3]), (q[0], q[3], q[0], q[1]))]
    def seg_d(px, pz, t):
        ax_, az_, bx_, bz_ = t; vx, vz = bx_ - ax_, bz_ - az_; L2 = vx * vx + vz * vz or 1e-9
        u = max(0, min(1, ((px - ax_) * vx + (pz - az_) * vz) / L2)); return math.hypot(px - ax_ - u * vx, pz - az_ - u * vz)
    def anchored(px, pz, me):
        if any(q[0] - 0.15 < px < q[2] + 0.15 and q[1] - 0.15 < pz < q[3] + 0.15 for q in pg['cols']): return True     # ends on a column
        return any(t is not me and seg_d(px, pz, t) < 0.15 for t in others_)
    def loose(s): return not (anchored(s[0], s[1], s) and anchored(s[2], s[3], s))
    single = {s for s in thin_s if axisok(s) and s not in treads and not paired(s) and not at_edge(s) and loose(s)}
    wall_s = [s for s in heavy + thin_s if axisok(s) and s not in treads and s not in single]
    # glazing drawn in the wall pen: three or more parallel strokes within 0.3 m (a wall has two faces)
    def ax_(s):
        return ('h', s[1], min(s[0], s[2]), max(s[0], s[2])) if abs(s[1] - s[3]) < 0.02 else ('v', s[0], min(s[1], s[3]), max(s[1], s[3]))
    A_ = [(s, ax_(s)) for s in wall_s]; glaze = set()
    for s, (o, c, lo, hi) in A_:
        if hi - lo < 0.5: continue
        offs = {round(c2 - c, 2) for t, (o2, c2, lo2, hi2) in A_ if t is not s and o2 == o and 0.02 < abs(c2 - c) < 0.32
                and min(hi, hi2) - max(lo, lo2) > 0.8 * min(hi - lo, hi2 - lo2)}
        if len(offs) >= 2: glaze.add(s)
    # (they stay in the wall raster too: inside the building they are glass partitions that bound rooms)
    win_s = [s for s in fine if s not in treads] + list(glaze)
    # stairs: flights side by side make one U-stair (the lifts beside it stay apart: they get their own shafts)
    blobs = [list(f[0]) + [f[2]] for f in flights]
    merged = True
    while merged:
        merged = False
        for a in range(len(blobs)):
            for b in range(a + 1, len(blobs)):
                A, B = blobs[a], blobs[b]
                if A[4] == B[4] and A[0] - 0.4 < B[2] and B[0] - 0.4 < A[2] and A[1] - 0.4 < B[3] and B[1] - 0.4 < A[3]:
                    blobs[a] = [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3]), A[4]]; del blobs[b]; merged = True; break
            if merged: break
    blobs = [b for b in blobs if (b[2] - b[0]) * (b[3] - b[1]) > 1.5]
    # lift shafts: a long shaft is two cabins side by side
    shafts = []
    for q in lifts:
        w_, d_ = q[2] - q[0], q[3] - q[1]
        if max(w_, d_) > 3.0:
            if d_ > w_: m_ = (q[1] + q[3]) / 2; shafts += [(q[0], q[1], q[2], m_ - 0.1), (q[0], m_ + 0.1, q[2], q[3])]
            else: m_ = (q[0] + q[2]) / 2; shafts += [(q[0], q[1], m_ - 0.1, q[3]), (m_ + 0.1, q[1], q[2], q[3])]
        else: shafts.append(q)
    # grid
    xs = [M(x, 0)[0] for s in wall_s for x in (s[0], s[2])]; zs = [M(0, z)[1] for s in wall_s for z in (s[1], s[3])]
    gx0 = math.floor((min(xs) - 0.6) * 10) / 10; gz0 = math.floor((min(zs) - 0.6) * 10) / 10
    gw = int(math.ceil((max(xs) + 0.6 - gx0) / CELL)); gh = int(math.ceil((max(zs) + 0.6 - gz0) / CELL))
    Pm = lambda x, z: ((M(x, z)[0] - gx0) / CELL * F, (M(x, z)[1] - gz0) / CELL * F)
    def raster(draw_fn):
        im = Image.new('1', (gw * F, gh * F), 0); draw_fn(ImageDraw.Draw(im))
        return np.asarray(im, bool).reshape(gh, F, gw, F).any(axis=(1, 3))
    lines = raster(lambda d: [d.line([Pm(s[0], s[1]), Pm(s[2], s[3])], fill=1, width=1) for s in wall_s])
    colm = raster(lambda d: [d.rectangle([Pm(q[0], q[1]), Pm(q[2], q[3])], fill=1) for q in pg['cols']])
    swing = raster(lambda d: ([d.polygon([Pm(*u) for u in q], fill=1, outline=1) for q in pg['leaves']],
                              [d.line([Pm(s[0], s[1]), Pm(s[2], s[3])], fill=1, width=3) for s in arcs],
                              [d.line([Pm(*c[0]), Pm(*c[1]), Pm(*c[2]), Pm(*c[3])], fill=1, width=3) for c in pg['curves']]))
    winl = raster(lambda d: [d.line([Pm(s[0], s[1]), Pm(s[2], s[3])], fill=1, width=1) for s in win_s])
    stairs = raster(lambda d: [d.rectangle([Pm(b[0], b[1]), Pm(b[2], b[3])], fill=1) for b in blobs])
    liftm = raster(lambda d: [d.rectangle([Pm(q[0], q[1]), Pm(q[2], q[3])], fill=1) for q in shafts])
    stairs |= liftm                                              # solid while rooms are found; walls in the end
    wall = close(lines, 3) | colm
    # free-standing bits that are neither columns nor walls (label frames, specks)
    lab, n = components(wall)
    for i in range(1, n + 1):
        cells = lab == i; ys, xs_ = np.nonzero(cells)
        if max(np.ptp(ys), np.ptp(xs_)) + 1 < 6 and not (cells & colm).any(): wall[cells] = False
    wall &= ~stairs
    # footprint: everything drawn, gaps up to 1.6 m bridged, filled from outside
    seal0 = wall | stairs | winl | swing
    R = 8
    grown = np.pad(dil(seal0, 2 * R + 1), 1)
    lab, n = components(~grown)
    outside = (lab == lab[0, 0])[1:-1, 1:-1]
    inside = ~dil(outside, 2 * R + 1) | (seal0 & ~outside)
    inside = close(inside, 3)
    edge = inside & ~ero(np.pad(inside, 3), 7)[3:-3, 3:-3]
    # glazing: where the drawing has glass strokes in the facade band.  Other gaps on its outer rim are peeled off
    # (the footprint ran a cell past the outer face there, or it is an entrance opening)
    win_m = close(winl, 3)
    street = np.zeros_like(wall); street[int((ZF_ - 1.2 - gz0) / CELL):, :] = True                # 1st floor street face
    rim = edge & ~wall & ~stairs & ~win_m
    for _ in range(3):
        peel = rim & dil(~inside, 3); inside &= ~peel; rim &= ~peel
    edge = inside & ~ero(np.pad(inside, 3), 7)[3:-3, 3:-3]
    windows = edge & ~stairs & ~colm & (dil(win_m, 3) | (~wall & street if key == '1' else False))   # glass across the whole wall; 1st floor: shopfronts wherever there is no wall
    wall &= ~windows
    wall &= inside
    seal = np.pad(wall | stairs | windows | ~inside | (swing & inside), 8, constant_values=True)
    free = inside & ~close(seal, 11)[8:-8, 8:-8]               # doorways up to 1 m closed while rooms are found
    lab, n = components(free)
    rooms, grid = [], np.zeros((gh, gw), np.uint8)
    for i in range(1, n + 1):
        cells = lab == i; ar = cells.sum() * CELL * CELL
        if ar < 0.8: continue
        ys, xs_ = np.nonzero(cells); rid = len(rooms) + 1; grid[cells] = rid
        rooms.append({'id': rid, 'area': round(float(ar), 1),
                      'bb': [round(gx0 + xs_.min() * CELL, 2), round(gz0 + ys.min() * CELL, 2), round(gx0 + (xs_.max() + 1) * CELL, 2), round(gz0 + (ys.max() + 1) * CELL, 2)],
                      'c': [round(gx0 + (xs_.mean() + .5) * CELL, 2), round(gz0 + (ys.mean() + .5) * CELL, 2)],
                      'fill': round(float(len(ys) / ((np.ptp(ys) + 1) * (np.ptp(xs_) + 1))), 2)})
    # partitions go down to their centre line (0.1 m); facade walls keep their thickness; columns stay whole
    facade = ~ero(np.pad(inside, 8), 9)[8:-8, 8:-8]
    wall = thin(wall) | (wall & facade) | (colm & inside)
    walk = inside & ~wall & ~stairs & ~windows
    grow(grid, walk)
    pocket = inside & (grid == 0) & ~stairs & ~windows & ~wall
    if pocket.any():
        wall = thin(wall | pocket) | (wall & facade) | (colm & inside)
        grow(grid, inside & ~wall & ~stairs & ~windows)
    wall |= inside & (grid == 0) & ~stairs & ~windows
    for r in rooms:                                              # areas after growing into the thinned walls
        r['area'] = round(float((grid == r['id']).sum()) * CELL * CELL, 1)
    rooms = [r for r in rooms if r['area'] > 0]
    # cadastral numbers: pair rooms and schedule entries by area, closest first
    sched = dict(SCHED[key]); pairs = []
    for r in rooms:
        for no, a in sched.items(): pairs.append((abs(r['area'] - a) / max(a, 4), r['id'], no))
    pairs.sort(); taken_r, taken_n = set(), set(); byid = {r['id']: r for r in rooms}
    for err, rid, no in pairs:
        if rid in taken_r or no in taken_n or err > 0.12: continue
        taken_r.add(rid); taken_n.add(no); byid[rid]['area'] = sched[no]; byid[rid]['pdf'] = no     # schedule area; number kept for checking only
    # rooms the site names: entrance hall, shops and the logistics hall (1st floor), the terrace (9th), the chiller
    # roof (10th)
    open_room = None
    for r in rooms:
        if key == '1' and r['c'][0] > XE + 0.3 and r['area'] > 20: r['name'] = 'Logistika'
        elif key == '1' and r['c'][0] > -17.6 and r['area'] > 40: r['name'] = 'Магазин'
    if key == '1':
        wing = [r for r in rooms if r['c'][0] < -17.6]
        if wing: max(wing, key=lambda r: r['bb'][3])['name'] = 'Kirish holli'
    if key == '9':
        open_room = min([r for r in rooms if r['area'] > 30 and r['bb'][2] > XE - 1], key=lambda r: r['fill'])
        open_room['name'] = 'Terrasa'
        # the sheet leaves the glass walls of the rooms along the back as gaps, so those rooms ran out to the parapet:
        # the strip between the parapet and their wall line is terrace too
        i0, i1 = int((XE - 27.40 + 0.3 - gx0) / CELL), int((XE - 4.0 - gx0) / CELL)
        cov = wall[:, i0:i1].mean(1); rows = np.nonzero(cov > 0.6)[0]
        outer = rows[0]; inner = next(j for j in np.nonzero(cov > 0.3)[0] if j > outer + 5)   # glass gaps: lower cover
        strip = np.zeros_like(wall); strip[outer + 1:inner, i0 - 3:i1 + 10] = True
        strip &= (grid > 0) & (grid != open_room['id'])
        grid[strip] = open_room['id']
        for r in rooms: r['area'] = round(float((grid == r['id']).sum()) * CELL * CELL, 1)
    if key == '10':
        open_room = max([r for r in rooms if r['c'][0] < -17.6], key=lambda r: r['area'])
        open_room['name'] = 'Chiller maydoni'
    parapet = np.zeros_like(wall)
    if open_room:
        near_open = dil(grid == open_room['id'], 5)
        outside_ = ~inside
        # the outer wall round it is only a parapet, through its whole thickness (the back wall of the 9th is drawn
        # as two lines 0.4 m apart); walls that also bound another room keep their full height
        other_ = (grid > 0) & (grid != open_room['id'])
        parapet = wall & dil(grid == open_room["id"], 13) & dil(outside_, 13) & ~colm & ~dil(other_, 5)
        if key == '9':                                                # rooms open onto the terrace through glass
            other = (grid > 0) & (grid != open_room['id'])
            glass = wall & near_open & dil(other, 5) & ~parapet & ~dil(colm, 3)
            windows |= glass; wall &= ~glass
        wall &= ~parapet
    if key == '10':
        # technical floor: the stair hall opens to the corridor and to the chiller roof through one door each
        st = stairs & ~liftm
        cnt = np.bincount(grid[dil(st, 5) & (grid > 0)].ravel(), minlength=256); cnt[0] = 0; cnt[250:] = 0
        sh = int(cnt.argmax())
        for oid in sorted({int(v) for v in np.unique(grid[dil(grid == sh, 3)]) if 0 < v < 250 and v != sh}):
            other = grid == oid
            touch = (grid == sh) & (np.roll(other, 1, 0) | np.roll(other, -1, 0) | np.roll(other, 1, 1) | np.roll(other, -1, 1))
            ys, xs_ = np.nonzero(touch)
            if len(ys) < 12: continue
            along = xs_ if np.ptp(xs_) >= np.ptp(ys) else ys; mid = (along.min() + along.max()) / 2
            door = np.abs(along - mid) <= 5                                      # 1.0 m doorway in the middle
            wall[ys[~door], xs_[~door]] = True; grid[ys[~door], xs_[~door]] = 0
    # 9th and 10th sheets draw no glazing: their facade takes the windows of the typical floor where it runs the same
    if key == '3':
        WIN3 = {(round(gx0 + i * CELL, 1), round(gz0 + j * CELL, 1)) for j, i in zip(*np.nonzero(windows))}
    if key in ('9', '10'):
        for j, i in zip(*np.nonzero(wall & edge & ~colm)):
            for dj in range(-2, 3):
                if (round(gx0 + i * CELL, 1), round(gz0 + (j + dj) * CELL, 1)) in WIN3: windows[j, i] = True; wall[j, i] = False; break
    code = grid.copy(); code[wall] = 255; code[stairs & inside & ~liftm] = 254; code[liftm] = 255; code[windows] = 253; code[parapet] = 252
    flat = code.ravel(); rle = []; i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 60000: j += 1
        rle += [int(flat[i]), j - i]; i = j
    result[key] = {'w': gw, 'h': gh, 'x0': round(gx0, 3), 'z0': round(gz0, 3), 'cell': CELL,
                   'outline': outline_of(dil(ero(close(inside, 5), 3), 3), gx0, gz0), 'rooms': rooms, 'rle': rle}
    R4 = lambda q: [round(M(q[0], q[1])[0], 2), round(M(q[0], q[1])[1], 2), round(M(q[2], q[3])[0], 2), round(M(q[2], q[3])[1], 2)]
    result[key]['cores'] = [{'r': R4(b), 'ax': b[4]} for b in blobs]           # stair flights (bbox), direction they run
    result[key]['lifts'] = [] if key == '10' else [R4(q) for q in shafts]       # lift shafts (none stop at the technical floor)
    result[key]['lifts'] += [list(q) + ['freight'] for q in FREIGHT.get(key, [])]
    if open_room:                                                # roofed part only (no terrace / chiller roof)
        cm = inside & (grid != open_room['id']) & ~parapet & ~close(grid == open_room['id'], 3)
        result[key]['cover'] = outline_of(dil(ero(cm, 5), 5), gx0, gz0)      # opened: no slivers along the parapet
    # debug picture
    dbg = np.zeros((gh, gw, 3), np.uint8) + 235
    pal = np.random.default_rng(3).integers(120, 230, (256, 3))
    for q in rooms: dbg[grid == q['id']] = pal[q['id']]
    dbg[wall] = (30, 30, 30); dbg[stairs & inside] = (200, 60, 60); dbg[windows] = (60, 160, 255); dbg[parapet] = (240, 150, 0)
    dbg[~inside & ~wall] = (255, 255, 255)
    S = 4; im = Image.fromarray(dbg).resize((gw * S, gh * S), Image.NEAREST); dr = ImageDraw.Draw(im)
    for q in rooms: dr.text(((q['c'][0] - gx0) / CELL * S - 12, (q['c'][1] - gz0) / CELL * S - 6), f"{q['id']}/{q.get('pdf', '?')}:{q['area']}", fill=(0, 0, 0))
    dr.text((4, 4), key, fill=(0, 0, 0))
    im.save(f'{OUT}/pdfplan-{key}.png')
    for q in rooms: q.pop('pdf', None)
    miss = sorted(set(SCHED[key]) - taken_n)
    print(key, 'grid', gw, gh, 'rooms', len(rooms), 'matched', len(taken_n), '/', len(SCHED[key]), 'missing', miss, 'stairs', len(blobs), 'outline pts', len(result[key]['outline']), flush=True)

with open(f'{OUT}/plans.js', 'w', encoding='utf-8') as f:
    f.write('// generated by tools/pdf_plans.py — walls, windows, stairs and rooms from the cadastral plans (chizma.pdf)\n')
    f.write('export const PLANS = ' + json.dumps(result, separators=(',', ':'), ensure_ascii=False) + ';\n')
