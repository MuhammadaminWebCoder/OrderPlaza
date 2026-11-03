"""Pull the drawing primitives out of the cadastral plan set (chizma.pdf) and sort them by role.
python tools/pdf_extract.py <chizma.pdf> <out.pkl> <debug dir>
The PDF is pure vector (no text layer).  Per page the strokes split by pen:
  heavy (0.84 / 1.14 pt)  wall faces of the main block, columns (rectangles)
  thin  (0.72 pt)         dimension lines + extension lines + ticks, but also the wing walls, lifts and stairs
  fine  (0.42 pt)         windows (glazing lines), stair treads
  quads                   door leaves;  curves: stair arrows, door arcs
A dimension line is a single stroke with a 45° tick at each end; one that has a partner face a wall's thickness
away is a wall face the dimension happens to run along, and stays.  Extension lines are single strokes too: only
what lies inside the footprint enclosed by paired faces is kept.  Coordinates come out in metres, x to the right
(east), z downwards (towards the street), origin at the page's top-left."""
import sys, math, pickle
import numpy as np
import pymupdf
from PIL import Image, ImageDraw

SRC, OUT, DBG = sys.argv[1:4]
doc = pymupdf.open(SRC)
NOMINAL = 220 * 25.4 / 72 / 1000            # metres per point if the sheets were printed at the 1:220 they state
# they were not: each sheet is scaled to fit.  Two overall dimensions per sheet (drawn length at 1:220 -> written
# value in metres) give the true scale and cancel the small overshoot of the dimension line past its ticks.
CAL = {1: ((54.87, 48.75), (47.98, 42.60)), 2: ((34.48, 42.40), (30.31, 37.25)), 3: ((48.46, 42.40), (30.94, 27.00)),
       4: ((46.98, 42.40), (30.0, 27.00)), 5: ((46.98, 42.40), (30.0, 27.00)), 6: ((46.98, 42.40), (30.0, 27.00)),
       7: ((46.98, 42.40), (29.99, 27.00)), 8: ((32.44, 27.40), (31.97, 27.00)), 9: ((13.16, 11.00), (7.93, 6.55))}
WALL = (0.06, 0.26)                         # face-to-face spacing of a drawn wall: partitions 0.1, walls 0.2 m

def axis(s):
    if abs(s[1] - s[3]) < 0.02: return 'h', s[1], min(s[0], s[2]), max(s[0], s[2])
    if abs(s[0] - s[2]) < 0.02: return 'v', s[0], min(s[1], s[3]), max(s[1], s[3])

def partnered(cands, others, lo_hi=WALL, cover=0.5):
    """strokes of `cands` that have a parallel stroke in `others` a wall's thickness away, overlapping most of them"""
    B = [a for a in map(axis, others) if a]
    out = set()
    for s in cands:
        a = axis(s)
        if not a or a[3] - a[2] < 0.15: continue
        o, c, lo, hi = a
        for o2, c2, lo2, hi2 in B:
            if o2 == o and lo_hi[0] < abs(c2 - c) < lo_hi[1] and min(hi, hi2) - max(lo, lo2) > cover * (hi - lo): out.add(s); break
    return out

pages = []
for pno, p in enumerate(doc):
    (l1, m1), (l2, m2) = CAL[pno + 1]; f = (l1 - l2) / (m1 - m2)
    R = p.rotation_matrix; k = NOMINAL / f
    T = lambda pt: (round((pt * R).x * k, 4), round((pt * R).y * k, 4))
    heavy, thin, fine, cols, leaves, curves = [], [], [], [], [], []
    for it in p.get_drawings():
        if it['type'] != 's': continue
        w, col = round(it.get('width') or 0, 2), it.get('color')
        if col != (0.0, 0.0, 0.0): continue                                  # grey: leader lines; blue: section mark
        for x in it['items']:
            if x[0] == 'l':
                s = (*T(x[1]), *T(x[2]))
                (heavy if w >= 0.84 else thin if w == 0.72 else fine).append(s)
            elif x[0] == 're':
                r = x[1]; a, b = T(r.tl), T(r.br)
                q = (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))
                if w >= 0.84: cols.append(q)
                else: thin += [(q[0], q[1], q[2], q[1]), (q[2], q[1], q[2], q[3]), (q[2], q[3], q[0], q[3]), (q[0], q[3], q[0], q[1])]
            elif x[0] == 'qu':
                q = x[1]; leaves.append([T(q.ul), T(q.ur), T(q.lr), T(q.ll)])
            elif x[0] == 'c':
                curves.append([T(x[1]), T(x[2]), T(x[3]), T(x[4])])
    L = lambda s: math.hypot(s[2] - s[0], s[3] - s[1])
    ticks, rest = [], []
    for s in thin:
        dx, dy = s[2] - s[0], s[3] - s[1]
        if 0.15 < L(s) < 0.9 and abs(abs(dx) - abs(dy)) < 0.12 * L(s): ticks.append(((s[0] + s[2]) / 2, (s[1] + s[3]) / 2))
        else: rest.append(s)
    near_tick = lambda x, y: any(abs(x - tx) < 0.2 and abs(y - ty) < 0.2 for tx, ty in ticks)
    faces = partnered(rest, rest + heavy)
    dims = [s for s in rest if near_tick(s[0], s[1]) and near_tick(s[2], s[3]) and s not in faces]
    dset = set(dims); keep = [s for s in rest if s not in dset]
    # footprint: everything enclosed by paired faces, the heavy pen, columns and door leaves
    walls_ = partnered(keep + heavy, keep + heavy, (0.06, 0.6))            # outer walls are thicker
    G = 0.05; gw, gh = int(p.rect.width * k / G) + 2, int(p.rect.height * k / G) + 2
    im = Image.new('L', (gw, gh), 0); d2 = ImageDraw.Draw(im)
    for s in list(walls_) + heavy: d2.line([(s[0] / G, s[1] / G), (s[2] / G, s[3] / G)], fill=255, width=3)
    for q in cols: d2.rectangle([q[0] / G, q[1] / G, q[2] / G, q[3] / G], fill=255)
    for q in leaves: d2.polygon([(u[0] / G, u[1] / G) for u in q], fill=255)
    for s_ in fine: d2.line([(s_[0] / G, s_[1] / G), (s_[2] / G, s_[3] / G)], fill=255, width=3)   # glazing closes the facade
    # gaps left in the outline (doorways without a leaf, entrances) are bridged by growing the strokes 0.8 m,
    # filling from outside, and shrinking back
    def box(a, r):
        kk = 2 * r + 1; cs = np.pad(np.pad(a, r).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        return cs[kk:, kk:] - cs[:-kk, kk:] - cs[kk:, :-kk] + cs[:-kk, :-kk]
    R_ = 16; strokes = np.asarray(im) > 0
    grown = Image.fromarray(np.pad(box(strokes, R_) > 0, 2).astype(np.uint8) * 255).copy()   # own buffer: floodfill cannot write into a numpy view
    ImageDraw.floodfill(grown, (0, 0), 128)
    outside = (np.asarray(grown) == 128)[2:-2, 2:-2]
    inside = ~(box(outside, R_) > 0) | (strokes & ~outside)
    near = box(inside, 6) > 0
    def inn(x, y):
        i, j = int(x / G), int(y / G); return 0 <= j < near.shape[0] and 0 <= i < near.shape[1] and near[j, i]
    draw = [s for s in keep if inn(s[0], s[1]) and inn(s[2], s[3]) and inn((s[0] + s[2]) / 2, (s[1] + s[3]) / 2)]
    fine = [s for s in fine if inn((s[0] + s[2]) / 2, (s[1] + s[3]) / 2)]
    pages.append(dict(page=pno + 1, heavy=heavy, thin=draw, dims=dims, fine=fine, cols=cols, leaves=leaves, curves=curves,
                      size=(p.rect.width * k, p.rect.height * k), inside=inside, G=G))
    # debug render
    S = 30; im = Image.new('RGB', (int(p.rect.width * k * S), int(p.rect.height * k * S)), 'white'); dr = ImageDraw.Draw(im)
    P = lambda x, y: (x * S, y * S)
    for s in dims: dr.line([P(s[0], s[1]), P(s[2], s[3])], fill=(215, 215, 215))
    for s in draw: dr.line([P(s[0], s[1]), P(s[2], s[3])], fill=(0, 140, 0), width=1)
    for s in heavy: dr.line([P(s[0], s[1]), P(s[2], s[3])], fill=(0, 0, 0), width=2)
    for s in fine: dr.line([P(s[0], s[1]), P(s[2], s[3])], fill=(0, 150, 255), width=1)
    for q in cols: dr.rectangle([P(q[0], q[1]), P(q[2], q[3])], fill=(255, 0, 0))
    for q in leaves: dr.polygon([P(*u) for u in q], outline=(200, 0, 200))
    for c in curves: dr.line([P(*u) for u in c], fill=(255, 140, 0))
    im.save(f'{DBG}/pdf-p{pno + 1}.png')
    print(pno + 1, f'scale 1:{220 / f:.0f}', 'heavy', len(heavy), 'thin', len(draw), 'dims', len(dims), 'fine', len(fine), 'cols', len(cols), 'leaves', len(leaves), 'curves', len(curves), flush=True)
pickle.dump(pages, open(OUT, 'wb'))
