"""Rasterise a region of a DXF modelspace (blocks exploded) to PNG, to look at drawing sheets.
python tools/dxf_render.py <file.dxf> <out.png> [x0 y0 x1 y1] [px_per_unit] [--titles out.txt]
Without a region the whole drawing is rendered small; --titles dumps every text with its position (UTF-8)."""
import sys, math
from ezdxf import recover
from PIL import Image, ImageDraw

args = [a for a in sys.argv[1:] if not a.startswith('--')]
path, out = args[0], args[1]
region = list(map(float, args[2:6])) if len(args) >= 6 else None
scale = float(args[6]) if len(args) >= 7 else None
doc, _ = recover.readfile(path)
msp = doc.modelspace()

segs, texts = [], []
def walk(entities, depth=0):
    for e in entities:
        t = e.dxftype()
        try:
            if t == 'INSERT' and depth < 4:
                walk(e.virtual_entities(), depth + 1)
            elif t == 'LINE':
                segs.append((e.dxf.start.x, e.dxf.start.y, e.dxf.end.x, e.dxf.end.y))
            elif t in ('LWPOLYLINE', 'POLYLINE'):
                pts = [(p[0], p[1]) for p in (e.get_points('xy') if t == 'LWPOLYLINE' else [v.dxf.location for v in e.vertices])]
                if e.is_closed and pts: pts.append(pts[0])
                segs.extend((a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:]))
            elif t in ('ARC', 'CIRCLE'):
                c, r = e.dxf.center, e.dxf.radius
                a0, a1 = (e.dxf.start_angle, e.dxf.end_angle) if t == 'ARC' else (0, 360)
                if a1 < a0: a1 += 360
                n = max(4, int((a1 - a0) / 15))
                pts = [(c.x + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), c.y + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
                segs.extend((a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:]))
            elif t in ('TEXT', 'MTEXT'):
                s = e.plain_text() if t == 'MTEXT' else e.dxf.text
                texts.append((s.replace('\n', ' ').strip(), e.dxf.insert.x, e.dxf.insert.y, e.dxf.get('char_height' if t == 'MTEXT' else 'height', 0)))
        except Exception:
            pass
walk(msp)

if '--titles' in sys.argv:
    with open(sys.argv[sys.argv.index('--titles') + 1], 'w', encoding='utf-8') as f:
        for s, x, y, h in texts: f.write(f'{x:.0f}\t{y:.0f}\t{h:.0f}\t{s}\n')

if region is None:
    # the main drawing = biggest connected group of occupied 5 m cells (stray entities far away are ignored)
    G = 5000.0; occ = {}
    for ax, ay, bx, by in segs: occ[(int((ax + bx) / 2 // G), int((ay + by) / 2 // G))] = 1
    seen, best = set(), []
    for c0 in occ:
        if c0 in seen: continue
        comp, st = [], [c0]; seen.add(c0)
        while st:
            c = st.pop(); comp.append(c)
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    n = (c[0] + dx, c[1] + dy)
                    if n in occ and n not in seen: seen.add(n); st.append(n)
        if len(comp) > len(best): best = comp
    region = [min(c[0] for c in best) * G, min(c[1] for c in best) * G, (max(c[0] for c in best) + 1) * G, (max(c[1] for c in best) + 1) * G]
x0, y0, x1, y1 = region
if scale is None: scale = 3000 / max(x1 - x0, y1 - y0)
W, H = int((x1 - x0) * scale) + 1, int((y1 - y0) * scale) + 1
img = Image.new('L', (W, H), 255); d = ImageDraw.Draw(img)
for ax, ay, bx, by in segs:
    if max(ax, bx) < x0 or min(ax, bx) > x1 or max(ay, by) < y0 or min(ay, by) > y1: continue
    d.line([((ax - x0) * scale, (y1 - ay) * scale), ((bx - x0) * scale, (y1 - by) * scale)], fill=0, width=1)
img.save(out)
print('region', [round(v) for v in region], 'size', W, H, 'segments', len(segs), 'texts', len(texts))
