"""Side-by-side picture: the plans the maket uses now (plans.js) and the DWG plan sheets mapped onto the same axes.
python tools/dwg_compare.py <ar_sheets.pkl> <out.png>"""
import sys, json, re, math, pickle
import numpy as np
from PIL import Image, ImageDraw

D = pickle.load(open(sys.argv[1], 'rb'))
src = open('assets/js/plans.js', encoding='utf-8').read()
PLANS = json.loads(re.search(r'export const PLANS = (\{.*\});', src, re.S).group(1))
AXX = np.array([0, 5.35, 6.65, 11.15, 17.15, 21.65, 27.65, 33.65, 39.65, 45.65, 48.65]) - 24.325
# DWG axis bubble centres (mm) per sheet: axes 1..11 along x, rows А, Г, Д along y
AX = {
    '1': ([-890268, -884818, -883218, -878718, -872718, -868218, -862218, -856218, -850218, -844218, -841218], (-904009, -892209, -889809)),
    '28': ([-889357, -883907, -882307, -877807, -871807, -867307, -861307, -855307, -849307, -843307, -840307], (-932708, -920708, -918408)),
    '10': ([-890268, -884818, -883218, -878718, -872718, -868218, -862218, -856218, -850218, -844218, -841218], (-964471, -952471, -950171)),
}
SKIP = {'САНТЕХНИКА', 'INTERIOR', 'NOITHAT', 'NOI THAT', 'OP-MOB-MOVIL', 'wood', 'Mebel 2', 'HID', 'razmer', 'ACO-текст', 'Defpoints'}
S = 14                                      # px per metre
X0, Z0, W, H = -25.5, -8.5, 51.0, 17.0

def tf(k):
    ax, (ya, yg, yd) = AX[k]
    fx = lambda x: float(np.interp(x, ax, AXX, left=None, right=None)) if ax[0] <= x <= ax[-1] else (AXX[0] + (x - ax[0]) / 1000 if x < ax[0] else AXX[-1] + (x - ax[-1]) / 1000)
    fz = lambda y: float(np.interp(y, [ya, yg, yd], [7.15, -4.85, -7.15])) if ya <= y <= yd else (7.15 - (y - ya) / 1000 if y < ya else -7.15 - (y - yd) / 1000)
    return fx, fz

def panel(title):
    im = Image.new('RGB', (int(W * S), int(H * S) + 22), 'white'); d = ImageDraw.Draw(im)
    d.text((6, 4), title, fill=(0, 0, 0))
    for x in AXX: d.line([((x - X0) * S, 22), ((x - X0) * S, im.height)], fill=(225, 225, 235))
    for z in (7.15, -4.85, -7.15): d.line([(0, (z - Z0) * S + 22), (im.width, (z - Z0) * S + 22)], fill=(225, 225, 235))
    return im, d

def maket(key, title):
    P = PLANS[key]; w, h = P['w'], P['h']
    g = np.zeros(w * h, np.uint8); o = 0
    for i in range(0, len(P['rle']), 2): g[o:o + P['rle'][i + 1]] = P['rle'][i]; o += P['rle'][i + 1]
    g = g.reshape(h, w)
    im, d = panel(title)
    for j in range(h):
        for i in range(w):
            v = g[j, i]
            if v in (253, 254, 255):
                x, z = P['x0'] + i * P['cell'], P['z0'] + j * P['cell']
                col = {255: (30, 30, 30), 254: (200, 60, 60), 253: (60, 140, 230)}[v]
                d.rectangle([(x - X0) * S, (z - Z0) * S + 22, (x + P['cell'] - X0) * S, (z + P['cell'] - Z0) * S + 22], fill=col)
    return im

def dwg(key, title):
    fx, fz = tf(key)
    im, d = panel(title)
    a, b, c, e = D['sheets'][key]
    ins = lambda x, y: a <= x <= c and b <= y <= e
    for x1, y1, x2, y2, L, dp in D['segs']:
        if L in SKIP or not (ins(x1, y1) and ins(x2, y2)): continue
        p, q = (fx(x1), fz(y1)), (fx(x2), fz(y2))
        if not all(X0 < u[0] < X0 + W and Z0 < u[1] < Z0 + H for u in (p, q)): continue
        d.line([((p[0] - X0) * S, (p[1] - Z0) * S + 22), ((q[0] - X0) * S, (q[1] - Z0) * S + 22)], fill=(20, 20, 20))
    for cx, cy, r, s0, s1, L, dp in D['arcs']:
        if L in SKIP or not ins(cx, cy): continue
        if s1 < s0: s1 += 360
        pts = [(fx(cx + r * math.cos(math.radians(s0 + (s1 - s0) * t / 8))), fz(cy + r * math.sin(math.radians(s0 + (s1 - s0) * t / 8)))) for t in range(9)]
        if not all(X0 < u[0] < X0 + W and Z0 < u[1] < Z0 + H for u in pts): continue
        d.line([((u[0] - X0) * S, (u[1] - Z0) * S + 22) for u in pts], fill=(120, 120, 120))
    for t, x, y, L in D['texts']:
        if ins(x, y) and re.fullmatch(r'\d{3}|\d+[.,]\d+м²', t):
            u, v = fx(x), fz(y)
            if X0 < u < X0 + W and Z0 < v < Z0 + H: d.text(((u - X0) * S, (v - Z0) * S + 22), t, fill=(200, 40, 40))
    return im

rows = [maket('1', 'HOZIRGI MAKET — 1-qavat (rasmdan taxminiy)'), dwg('1', 'DWG — 1-qavat (±0.000)'),
        maket('28', 'HOZIRGI MAKET — 2-8-qavatlar'), dwg('28', 'DWG — 2-9-qavatlar (+4.200 ... +29.400)'),
        maket('10', 'HOZIRGI MAKET — 10-qavat'), dwg('10', 'DWG — yuqori qavat (+33.000)')]
out = Image.new('RGB', (rows[0].width, sum(r.height + 8 for r in rows)), (90, 90, 90)); y = 0
for r in rows: out.paste(r, (0, y)); y += r.height + 8
out.save(sys.argv[2]); print('saved', out.size)
