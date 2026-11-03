"""Build assets/js/plans.js from the DWG floor plans (via the DXF caches made by dxf_cache.py).
python tools/dxf_plans.py <debug dir>
Each plan is rasterised on the maket's 0.1 m grid after mapping the DWG axes 1..11 / А, Г, Д onto the maket axes,
so walls line up with the facade.  Output format is the one interior.js already reads (walls, stairs, windows,
rooms, rle) plus the DWG room number, name and area where the drawing gives them."""
import sys, json, re, math, pickle
import numpy as np
from PIL import Image, ImageDraw

DEBUG = sys.argv[1]
AXX = np.array([0, 5.35, 6.65, 11.15, 17.15, 21.65, 27.65, 33.65, 39.65, 45.65, 48.65]) - 24.325
X0, XW, XT, X1 = AXX[0], AXX[1], AXX[5], AXX[10]
ZF, ZB = 7.15, -7.15
X9, ZF9, ZB9 = X1 - 2.8, ZF - 1.6, ZB + 1.4          # setback of the top floor on the main block
PODIUM = 1.5                                          # shops stand out of the facade by this much (1st floor)
EXT = 2.5                                             # the end bay (logistics) runs on past the east end, full depth
CELL, M = 0.1, 0.6
SKIP = {'САНТЕХНИКА', 'INTERIOR', 'NOITHAT', 'NOI THAT', 'OP-MOB-MOVIL', 'wood', 'Mebel 2', 'HID', 'razmer', 'ACO-текст',
        'Defpoints', 'TEXT-1', 'TEXT-2', 'TEXT-3', 'os', 'table', 'Узель пола'}
AR = pickle.load(open('_manba/work/ar_sheets.pkl', 'rb'))
E9 = pickle.load(open('_manba/work/9etaj.pkl', 'rb'))
PB = pickle.load(open('_manba/work/podval.pkl', 'rb'))      # basement sheet of 18.01.2023.dwg
TYP_NAMES = {201: ('Мажлислар зали', 56.02), 202: ('Хона', 14.80), 203: ('Апартамент', 41.52), 204: ('Апартамент', 24.37),
             205: ('Апартамент', 32.71), 206: ('Апартамент', 32.11), 207: ('Апартамент', 32.74), 208: ('Апартамент', 38.22),
             209: ('Апартамент', 46.22), 210: ('Апартамент', 30.89), 211: ('Апартамент', 30.31), 212: ('Апартамент', 30.96),
             213: ('Апартамент', 25.62), 214: ('Апартамент', 49.89)}
CFG = {
    'b': dict(src=PB, sheet='b', rows=(35897, 47697, 50097),
              ax=[735516, 740966, 742566, 747066, 753066, 757566, 763566, 769566, 775566, 781566, 784566]),
    '1': dict(src=AR, sheet='1', rows=(-904009, -892209, -889809),
              ax=[-890268, -884818, -883218, -878718, -872718, -868218, -862218, -856218, -850218, -844218, -841218]),
    '28': dict(src=AR, sheet='28', rows=(-932708, -920708, -918408),
               ax=[-889357, -883907, -882307, -877807, -871807, -867307, -861307, -855307, -849307, -843307, -840307]),
    '10': dict(src=E9, sheet='10', rows=(-1239719, -1227701, -1225401),
               ax=[-830954, -825604, -824304, -819804, -813804, -809304, -803304, -797304, -791304, -785304, -782304]),
}

def outline(k):
    if k == '10': return [(X0, ZF), (XT, ZF), (XT, ZF9), (X9, ZF9), (X9, ZB9), (XT, ZB9), (XT, ZB), (X0, ZB)]
    if k == '1': return [(X0, ZF + PODIUM), (X1 + EXT, ZF + PODIUM), (X1 + EXT, ZB), (X0, ZB)]
    return [(X0, ZF), (X1, ZF), (X1, ZB), (X0, ZB)]

def mapper(c):
    ax, (ya, yg, yd) = c['ax'], c['rows']
    def fx(x):
        if x < ax[0]: return AXX[0] + (x - ax[0]) / 1000
        if x > ax[-1]: return AXX[-1] + (x - ax[-1]) / 1000
        return float(np.interp(x, ax, AXX))
    def fz(y):
        if y < ya: return ZF - (y - ya) / 1000
        if y > yd: return ZB - (y - yd) / 1000
        return float(np.interp(y, [ya, yg, yd], [ZF, ZF - 12, ZB]))
    return fx, fz

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
    """Zhang-Suen thinning to a one-cell centre line, then diagonal steps filled so it stays 4-connected
    (rooms must not leak through a diagonal)"""
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

result = {}
for key, c in CFG.items():
    fx, fz = mapper(c); D = c['src']; a, b, cc, dd = D['sheets'][c['sheet']]
    ins = lambda x, y: a <= x <= cc and b <= y <= dd
    gx0, gz0 = X0 - M, ZB - M
    gw, gh = int(round((X1 - X0 + 2 * M) / CELL)), int(round((ZF - ZB + 2 * M) / CELL))
    F = 4                                                   # draw at 2.5 cm, pool to 10 cm
    img = Image.new('1', (gw * F, gh * F), 0); d = ImageDraw.Draw(img)
    imd = Image.new('1', (gw * F, gh * F), 0); dd2 = ImageDraw.Draw(imd)      # door swings and leaves: room borders only
    P = lambda x, z: ((x - gx0) / CELL * F, (z - gz0) / CELL * F)
    ok = lambda x, z: X0 - M < x < X1 + M and ZB - M < z < ZF + M
    # frames drawn round room numbers and areas are not walls
    labels = [(fx(x), fz(y)) for t, x, y, L in D['texts'] if ins(x, y) and re.fullmatch(r'\d{1,3}|\d+[.,]\d+м²', t)]
    near_label = lambda p: any(lx - 0.3 < p[0] < lx + 2.4 and lz - 0.4 < p[1] < lz + 0.75 for lx, lz in labels)   # 2.2 × 0.7 m frames
    swings = []                                             # (hinge x, z, leaf length) of every door arc, metres
    for cx, cy, r, s0, s1, L, dp in D['arcs']:
        if not ins(cx, cy) or r > 1300 or (L in SKIP and not 600 < r < 1100): continue      # furniture layers: only door-sized arcs
        if s1 < s0: s1 += 360
        pts = [(fx(cx + r * math.cos(math.radians(s0 + (s1 - s0) * t / 10))), fz(cy + r * math.sin(math.radians(s0 + (s1 - s0) * t / 10)))) for t in range(11)]
        if all(ok(*u) for u in pts):
            dd2.line([P(*u) for u in pts], fill=1, width=2); swings.append((fx(cx), fz(cy), r / 1000))
    is_leaf = lambda p, q, ln: any(abs(ln - sr) < 0.2 and min(math.hypot(p[0] - hx, p[1] - hz), math.hypot(q[0] - hx, q[1] - hz)) < 0.12 for hx, hz, sr in swings)
    for x1, y1, x2, y2, L, dp in D['segs']:
        if L in SKIP or not (ins(x1, y1) and ins(x2, y2)): continue
        p, q = (fx(x1), fz(y1)), (fx(x2), fz(y2))
        if not (ok(*p) and ok(*q)): continue                # axis lines, dimensions and bubbles run outside
        ln = math.hypot(p[0] - q[0], p[1] - q[1])
        if ln < 2.5 and near_label(p) and near_label(q): continue
        (dd2 if is_leaf(p, q, ln) else d).line([P(*p), P(*q)], fill=1, width=2)    # a door leaf is not a wall
    lines = np.asarray(img, bool).reshape(gh, F, gw, F).any(axis=(1, 3))
    swing = np.asarray(imd, bool).reshape(gh, F, gw, F).any(axis=(1, 3))
    # 1st floor: the shops are pushed out towards the street — stretch the plan at a row inside the shops
    if key == '1':
        r0 = int((ZF - 1.3 - gz0) / CELL); n = int(round(PODIUM / CELL))
        stretch = lambda a: np.vstack([a[:r0], np.repeat(a[r0:r0 + 1], n, 0), a[r0:]])
        lines, swing = stretch(lines), stretch(swing); gh += n
        # end bay: the east wall moves out by EXT over the full depth; front and back facade lines carry on, the rest is open
        n2 = int(round(EXT / CELL))
        cw, c0 = int((X1 - 0.6 - gx0) / CELL), int((X1 - 0.9 - gx0) / CELL)
        jf, jb = int((ZF + PODIUM - 0.6 - gz0) / CELL), int((ZB + 0.6 - gz0) / CELL)
        def widen(a, carry):
            wide = np.zeros((gh, gw + n2), bool); wide[:, :gw] = a
            wide[:, cw:cw + n2] = False
            if carry: wide[jf:, cw:cw + n2] = a[jf:, c0:c0 + 1]; wide[:jb, cw:cw + n2] = a[:jb, c0:c0 + 1]
            wide[:, cw + n2:] = a[:, cw:]
            return wide
        lines, swing = widen(lines, True), widen(swing, False); gw += n2
    # building footprint on the grid
    poly = Image.new('1', (gw, gh), 0)
    ImageDraw.Draw(poly).polygon([((x - gx0) / CELL, (z - gz0) / CELL) for x, z in outline(key)], fill=1)
    inside = np.asarray(poly, bool)
    edge = inside & ~ero(inside, 3)
    wall = close(lines, 5) & dil(inside, 5)
    wall |= edge & dil(lines, 3)                            # facade line where the drawing has it
    stairs = dil(ero(wall, 9), 9) & wall & inside
    lab, n = components(stairs)                              # real flights are big; column hatches and shafts stay walls
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 250 or min(np.ptp(ys), np.ptp(xs)) + 1 < 10 or gx0 + xs.min() * CELL > X1 - 0.2: stairs[lab == i] = False   # incl. the outside lift shaft
    wall &= ~stairs
    lab, n = components(wall)
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if max(np.ptp(ys), np.ptp(xs)) + 1 < 15: wall[lab == i] = False    # free-standing bits: columns, label frames, specks
    if key == '1':
        # end bay (axis 10 to the moved east wall) is one open logistics hall: no inner walls, the stair stands in it
        zz, xx = np.mgrid[0:gh, 0:gw]; xw, zw = gx0 + (xx + 0.5) * CELL, gz0 + (zz + 0.5) * CELL
        wall[(xw > X1 - 2.75) & (xw < X1 + EXT - 0.45) & (zw > ZB + 0.45) & (zw < ZF + PODIUM - 0.45)] = False
        wall[(np.abs(xw - (X1 - 3.05)) < 0.15) & (zw > ZB) & (zw < ZF + PODIUM)] = True     # axis 10: closed off from the next shop
        swing[(xw > X1 - 2.75) & (zw > ZB + 0.45)] = False
    wall &= inside | ~dil(inside, 1)
    windows = edge & ~wall & ~stairs
    seal = np.pad(wall | stairs | windows | ~inside | (swing & inside), 8, constant_values=True)
    free = inside & ~close(seal, {"10": 15}.get(key, 9))[8:-8, 8:-8]     # door swings close most doorways; 9 etaj has few
    lab, n = components(free)
    if key == '28':
        # a room whose doorway had no swing drawn leaks into the corridor: whatever of the corridor lies more than
        # 1.3 m off its centre line (east of the wing) becomes a room of its own
        sizes = np.bincount(lab.ravel()); sizes[0] = 0; cor = int(sizes.argmax())
        ys, xs = np.nonzero(lab == cor); zc = np.median(ys)
        stray = (lab == cor) & (np.abs(np.arange(gh)[:, None] - zc) > 13) & (np.arange(gw)[None, :] > int((-14.5 - gx0) / CELL))   # east of the lift lobby
        sl, sn = components(stray)
        for i in range(1, sn + 1): lab[sl == i] = n + i
        n += sn
    rooms, grid = [], np.zeros((gh, gw), np.uint8)
    for i in range(1, n + 1):
        cells = lab == i; ar = cells.sum() * CELL * CELL
        if ar < 0.8: continue
        ys, xs = np.nonzero(cells); rid = len(rooms) + 1; grid[cells] = rid
        rooms.append({'id': rid, 'area': round(float(ar), 1),
                      'bb': [round(gx0 + xs.min() * CELL, 2), round(gz0 + ys.min() * CELL, 2), round(gx0 + (xs.max() + 1) * CELL, 2), round(gz0 + (ys.max() + 1) * CELL, 2)],
                      'c': [round(gx0 + (xs.mean() + .5) * CELL, 2), round(gz0 + (ys.mean() + .5) * CELL, 2)],
                      'fill': round(float(len(ys) / ((np.ptp(ys) + 1) * (np.ptp(xs) + 1))), 2)})
    # rooms are found on the drawn (thick) walls; now the interior partitions go down to their centre line (0.1 m) and
    # the freed strip joins the rooms either side; facade walls (within 0.5 m of the outline) keep their thickness
    facade = ~ero(np.pad(inside, 8), 11)[8:-8, 8:-8]
    wall = thin(wall) | (wall & facade)
    walk = inside & ~wall & ~stairs & ~windows
    for _ in range(40):
        z = (grid == 0) & walk
        if not z.any(): break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(grid, (dy, dx), (0, 1)); m = z & (grid == 0) & (sh > 0); grid[m] = sh[m]
    # a wide opening between two rooms is a partition the drawing left out: wall it up (corridors and halls stay open,
    # real doorways are narrower than 2.2 m; a room left without a way in gets a door cut by interior.js)
    hallish = {r['id'] for r in rooms if r['fill'] < 0.6 or r['area'] > 60}
    pairs = {}
    for dy, dx in ((0, 1), (1, 0)):
        A, B = grid[:gh - dy, :gw - dx], grid[dy:, dx:]
        ys, xs = np.nonzero((A > 0) & (B > 0) & (A != B))
        for y, x in zip(ys.tolist(), xs.tolist()):
            ka, kb = int(A[y, x]), int(B[y, x]); pairs.setdefault((min(ka, kb), max(ka, kb)), []).append((y, x, y + dy, x + dx))
    rarea = {r['id']: r['area'] for r in rooms}
    for (ka, kb), cells in pairs.items():
        if len(cells) <= 22 or ka in hallish or kb in hallish: continue
        small = ka if rarea[ka] < rarea[kb] else kb
        for y0, i0, y1, i1 in cells:
            if grid[y0, i0] == small: wall[y0, i0] = True; grid[y0, i0] = 0
            else: wall[y1, i1] = True; grid[y1, i1] = 0
    # closed pockets no room reached (shafts, ducts) would stand as thick blocks: thin them to a line too and let
    # the rooms either side take the space; whatever is still left over becomes wall
    pocket = inside & (grid == 0) & ~stairs & ~windows
    if pocket.any():
        wall = thin(wall | pocket) | (wall & facade)
        walk = inside & ~wall & ~stairs & ~windows
        for _ in range(40):
            z = (grid == 0) & walk
            if not z.any(): break
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                sh = np.roll(grid, (dy, dx), (0, 1)); m = z & (grid == 0) & (sh > 0); grid[m] = sh[m]
    wall |= inside & (grid == 0) & ~stairs & ~windows
    # DWG labels: room numbers (typical floor, top floor) and shop areas (1st floor)
    byid = {r['id']: r for r in rooms}
    def room_at(x, z):
        i, j = int((x - gx0) / CELL), int((z - gz0) / CELL)
        if key == '1' and z > ZF - 1.3: j += int(round(PODIUM / CELL))
        if 0 <= i < gw and 0 <= j < gh:
            v = int(grid[j, i])
            if v in byid: return byid[v]
            for rr in range(1, 8):                          # label sitting on a wall line: nearest room
                for dj in range(-rr, rr + 1):
                    for di in range(-rr, rr + 1):
                        if 0 <= j + dj < gh and 0 <= i + di < gw and int(grid[j + dj, i + di]) in byid: return byid[int(grid[j + dj, i + di])]
        return None
    for t, x, y, L in D['texts']:
        if not ins(x, y): continue
        X, Z = fx(x + 150), fz(y + 150)
        if not (X0 < X < X1 and ZB < Z < ZF): continue
        r = room_at(X, Z)
        if not r: continue
        if key == '28' and re.fullmatch(r'2\d\d', t) and int(t) in TYP_NAMES:
            if r['fill'] < 0.6 or (r['bb'][2] - r['bb'][0]) > 8:     # number sits in the corridor by the door
                side = 1 if int(t) >= 209 else -1                       # 209-214: street side row, 203-208: back row
                near = [q for q in rooms if abs(q['c'][0] - X) < 3.2 and side * (q['c'][1] - Z) > 0.8 and q['fill'] >= 0.6 and q['area'] > 8 and 'no' not in q]
                if not near: continue
                r = max(near, key=lambda q: q['area'])
            r['no'] = int(t); r['name'], r['area'] = TYP_NAMES[int(t)]
        elif key == 'b' and re.fullmatch(r'\d+[.,]\d+m2', t):
            r['area'] = float(t[:-2].replace(',', '.'))
        elif key == '1' and re.fullmatch(r'\d+[.,]\d+м²', t):
            r['area'] = float(t[:-2].replace(',', '.')); r['name'] = 'Магазин'
    if key == '1':                                           # the shop behind the reception becomes its lobby
        r = room_at(-10.2, 2.5)
        if r: r['name'] = 'Resepshn holli'; r['lobby'] = True
        r = room_at(X1 + 0.5, 3.0)
        if r: r['name'] = 'Logistika'
        r = room_at(-19.5, 5.0)                               # in front of the stair + lift core
        if r and 'name' not in r: r['name'] = 'Kirish holli'
    code = grid.copy(); code[wall] = 255; code[stairs] = 254; code[windows] = 253
    flat = code.ravel(); rle = []; i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 60000: j += 1
        rle += [int(flat[i]), j - i]; i = j
    tow = lambda q: [round(gx0 + q[0] * CELL, 2), round(gz0 + q[1] * CELL, 2), round(gx0 + q[2] * CELL, 2), round(gz0 + q[3] * CELL, 2)]
    result[key] = {'w': gw, 'h': gh, 'x0': round(gx0, 3), 'z0': round(gz0, 3), 'cell': CELL,
                   'walls': [tow(q) for q in rects(wall)], 'stairs': [tow(q) for q in rects(stairs)],
                   'windows': [tow(q) for q in rects(windows)], 'rooms': rooms, 'rle': rle}
    dbg = np.zeros((gh, gw, 3), np.uint8) + 235
    pal = np.random.default_rng(3).integers(120, 230, (256, 3))
    for q in rooms: dbg[grid == q['id']] = pal[q['id']]
    dbg[wall] = (30, 30, 30); dbg[stairs] = (200, 60, 60); dbg[windows] = (60, 160, 255)
    im = Image.fromarray(dbg).resize((gw * 3, gh * 3), Image.NEAREST); dr = ImageDraw.Draw(im)
    for q in rooms: dr.text(((q['c'][0] - gx0) / CELL * 3 - 10, (q['c'][1] - gz0) / CELL * 3 - 6), f"{q['id']}{'/' + str(q['no']) if 'no' in q else ''} {q['area']}", fill=(0, 0, 0))
    im.save(f'{DEBUG}/plan-{key}.png')
    print(key, 'rooms', len(rooms), 'named', sum('name' in q or 'no' in q for q in rooms), 'walls', len(result[key]['walls']), 'stairs', len(result[key]['stairs']), flush=True)

with open(f'{DEBUG}/plans.js', 'w', encoding='utf-8') as f:
    f.write('// generated by tools/dxf_plans.py — walls, stairs and rooms from the DWG floor plans (Biznes Center AR, 9 etaj)\n')
    f.write('export const PLANS = ' + json.dumps(result, separators=(',', ':'), ensure_ascii=False) + ';\n')
