"""Vectorise walls + rooms from the M 1:200 plan board into a compact JSON for the 3D maket."""
import sys, json
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

BOARD, OUT, DEBUG = sys.argv[1], sys.argv[2], sys.argv[3]
board = np.asarray(Image.open(BOARD).convert('RGB')).astype(np.int16)

# axis pixels (axis 1 / last axis, axis Д / А) and real spans in metres
AX = {'b': (588, 4036, 521, 1527, 48.65, 14.2), '1': (2811, 6258, 2016, 3030, 48.65, 14.3),
      '28': (638, 4086, 3970, 4984, 48.65, 14.3), '9': (2812, 6259, 5609, 6623, 48.65, 14.3),
      '10': (644, 2178, 7307, 8320, 21.65, 14.3)}
X0W, ZBW = -24.325, -7.15     # world coords of axis 1 and axis Д
M = 0.6                       # margin around axes (m)
CELL = 0.1

def boxsum(a, k):
    """sum over a k×k window centred on each pixel (k odd), via integral image"""
    r = k // 2
    p = np.pad(a.astype(np.int32), ((r + 1, r), (r + 1, r)))
    c = p.cumsum(0).cumsum(1)
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
dil = lambda a, k: boxsum(a, k) > 0
ero = lambda a, k: boxsum(a, k) == k * k
close = lambda a, k: ero(dil(a, k), k)
opn = lambda a, k: dil(ero(a, k), k)

def components(mask):
    """4-connected labelling (iterative BFS) on a small grid"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32); n = 0
    for y0 in range(h):
        for x0 in range(w):
            if mask[y0, x0] and not lab[y0, x0]:
                n += 1; st = [(y0, x0)]; lab[y0, x0] = n
                while st:
                    y, x = st.pop()
                    for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n; st.append((yy, xx))
    return lab, n

def rects(mask):
    """greedy merge of a boolean grid into rectangles (row runs merged downwards)"""
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

def outline_mask(k, gw, gh):
    """building footprint on the grid (matches maket.js outline())"""
    X = lambda m: int(round((m + M) / CELL)); Z = lambda m: int(round((m + M) / CELL))
    g = np.zeros((gh, gw), bool)
    xw, zg = 5.35, 2.3  # core wing width, notch depth at axis Д side
    L = 21.65 if k == '10' else 48.65
    g[Z(zg):Z(14.3), X(0):X(xw)] = True
    g[Z(0):Z(14.3), X(xw):X(L)] = True
    if k == '9':  # main-block setback (front 1.6, back 1.4, right 2.8)
        g[:, X(21.65):] = False
        g[Z(1.4):Z(14.3 - 1.6), X(21.65):X(48.65 - 2.8)] = True
    return g

result = {}
for k, (x1p, x2p, ydp, yap, L, D) in AX.items():
    sx, sy = (x2p - x1p) / L, (yap - ydp) / D
    crop = board[int(ydp - M * sy):int(yap + M * sy), int(x1p - M * sx):int(x2p + M * sx)]
    r, g, b = crop[..., 0], crop[..., 1], crop[..., 2]
    black = (np.maximum(np.maximum(r, g), b) < 85)
    # partition lines are drawn in saturated blue / red / purple; dimension lines are grey-blue (g≈96)
    colour = (g < 80) & (np.maximum(r, b) > 110)
    red = (r > 170) & (g < 150) & (b < 150) & (r - g > 90)
    gypsum = (r < 50) & (b > 170) & (b - r > 140)   # light-blue partition outlines
    lines = black | colour | red | gypsum
    # drop small free-standing marks (room-number circles, digits) before closing
    ys, xs = np.nonzero(lines)
    idx = {}
    for i, (y, x) in enumerate(zip(ys.tolist(), xs.tolist())): idx[(y, x)] = i
    seen = np.zeros(len(ys), bool); lim = int(0.7 * sx)  # circles are ~0.55 m
    for i0 in range(len(ys)):
        if seen[i0]: continue
        st = [i0]; seen[i0] = True; comp = [i0]
        y0 = y1 = ys[i0]; x0 = x1 = xs[i0]; big = False
        while st:
            i = st.pop(); y, x = int(ys[i]), int(xs[i])
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    j = idx.get((y + dy, x + dx))
                    if j is not None and not seen[j]:
                        seen[j] = True; st.append(j); comp.append(j)
                        if not big:
                            y0 = min(y0, ys[j]); y1 = max(y1, ys[j]); x0 = min(x0, xs[j]); x1 = max(x1, xs[j])
                            big = (y1 - y0) > lim or (x1 - x0) > lim
        if big: continue
        bh, bw = y1 - y0 + 1, x1 - x0 + 1
        roundish = 0.6 < bh / bw < 1.6 and 0.3 * sx < max(bh, bw)
        if max(bh, bw) < 0.22 * sx or roundish: lines[ys[comp], xs[comp]] = False
    k_close = int(0.34 * sx) | 1
    solid = opn(close(lines, k_close), 7)
    # single pure-blue lines are light (glass) partitions: keep them even though they are thin
    glass = opn(dil((b > 180) & (r < 60) & (g < 60), 5), 3)
    solid |= glass
    # resample to the 0.1 m grid
    gw, gh = int(round((L + 2 * M) / CELL)), int(round((D + 2 * M) / CELL))
    img = Image.fromarray((solid * 255).astype(np.uint8)).resize((gw, gh), Image.BOX)
    wall = np.asarray(img) > 90
    inside = outline_mask(k, gw, gh)
    # the footprint edge is always wall or window
    edge = inside & ~ero(inside, 3)
    wall &= dil(inside, 5)
    # drop small specks (text blobs) and split off stair blocks
    # thick solid blobs (stair flights, lift cores drawn densely) become stairs, not walls
    stairs = dil(ero(wall, 9), 9) & wall
    wall &= ~stairs
    lab, n = components(wall)
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        bh, bw = np.ptp(ys) + 1, np.ptp(xs) + 1
        if max(bh, bw) < 9: wall[lab == i] = False   # room-number circles, text, isolated specks
    windows = edge & ~wall & ~stairs
    solid_for_rooms = close(np.pad(wall | stairs | windows | ~inside, 8, constant_values=True), 15)[8:-8, 8:-8]
    free = inside & ~solid_for_rooms
    lab, n = components(free)
    rooms = []; grid = np.zeros((gh, gw), np.uint8)
    for i in range(1, n + 1):
        cells = lab == i; a = cells.sum() * CELL * CELL
        if a < 0.8: continue
        ys, xs = np.nonzero(cells)
        rid = len(rooms) + 1; grid[cells] = rid
        rooms.append({'id': rid, 'area': round(float(a), 1),
                      'bb': [round(X0W - M + xs.min() * CELL, 2), round(ZBW - M + ys.min() * CELL, 2),
                             round(X0W - M + (xs.max() + 1) * CELL, 2), round(ZBW - M + (ys.max() + 1) * CELL, 2)],
                      'c': [round(X0W - M + (xs.mean() + .5) * CELL, 2), round(ZBW - M + (ys.mean() + .5) * CELL, 2)],
                      'fill': round(float(len(ys) / ((np.ptp(ys) + 1) * (np.ptp(xs) + 1))), 2)})
    # give doorway / closed-gap cells to the neighbouring room so walking always knows the room
    walk = inside & ~wall & ~stairs & ~windows
    for _ in range(14):
        z = (grid == 0) & walk
        if not z.any(): break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(grid, (dy, dx), (0, 1))
            m = z & (grid == 0) & (sh > 0); grid[m] = sh[m]
    code = grid.copy()
    code[wall] = 255; code[stairs] = 254; code[windows] = 253
    code[~inside & (code == 0)] = 0
    flat = code.ravel(); rle = []; i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 60000: j += 1
        rle += [int(flat[i]), j - i]; i = j
    tow = lambda rc: [round(X0W - M + rc[0] * CELL, 2), round(ZBW - M + rc[1] * CELL, 2), round(X0W - M + rc[2] * CELL, 2), round(ZBW - M + rc[3] * CELL, 2)]
    result[k] = {'w': gw, 'h': gh, 'x0': X0W - M, 'z0': ZBW - M, 'cell': CELL,
                 'walls': [tow(q) for q in rects(wall)], 'stairs': [tow(q) for q in rects(stairs)],
                 'windows': [tow(q) for q in rects(windows)], 'rooms': rooms, 'rle': rle}
    # debug picture
    dbg = np.zeros((gh, gw, 3), np.uint8) + 235
    rng = np.random.default_rng(3); pal = rng.integers(120, 230, (256, 3))
    for q in rooms: dbg[grid == q['id']] = pal[q['id']]
    dbg[wall] = (30, 30, 30); dbg[stairs] = (200, 60, 60); dbg[windows] = (60, 160, 255)
    Image.fromarray(dbg).resize((gw * 3, gh * 3), Image.NEAREST).save(f'{DEBUG}/dbg-{k}.png')
    print(k, 'walls', len(result[k]['walls']), 'rooms', len(rooms), 'rle', len(rle), flush=True)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// generated by extract.py — walls, stairs, windows and rooms traced from the M 1:200 plans\n')
    f.write('export const PLANS = ' + json.dumps(result, separators=(',', ':')) + ';\n')
