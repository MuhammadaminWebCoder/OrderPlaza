"""Read Biznes Center AR.dxf once (blocks exploded) and pickle the primitives of the plan sheets we use,
so the plan extractor can iterate quickly.  python tools/dxf_cache.py <file.dxf> <out.pkl>"""
import sys, math, pickle
from ezdxf import recover

SHEETS = {   # DXF rectangles (mm) of the final 10-storey drawing set (override: 4th argument 'key:x0,y0,x1,y1')
    '1': (-897200, -913400, -837700, -884100),
    '28': (-897200, -943100, -823600, -913600),
    '10': (-897200, -972800, -816600, -943300),
}
if len(sys.argv) > 3:
    k, r = sys.argv[3].split(":"); SHEETS = {k: tuple(map(float, r.split(",")))}
doc, _ = recover.readfile(sys.argv[1])
segs, arcs, circles, texts = [], [], [], []
inside = lambda x, y: any(a <= x <= c and b <= y <= d for a, b, c, d in SHEETS.values())

def walk(entities, layer=None, depth=0):
    for e in entities:
        t = e.dxftype(); L = e.dxf.layer if layer in (None, '0') else layer
        try:
            if t == 'INSERT' and depth < 5:
                walk(e.virtual_entities(), L if e.dxf.layer != '0' else layer, depth + 1)
            elif t == 'LINE':
                a, b = e.dxf.start, e.dxf.end
                if inside(a.x, a.y) or inside(b.x, b.y): segs.append((a.x, a.y, b.x, b.y, L, depth))
            elif t in ('LWPOLYLINE', 'POLYLINE'):
                pts = [(p[0], p[1]) for p in (e.get_points('xy') if t == 'LWPOLYLINE' else [v.dxf.location for v in e.vertices])]
                if e.is_closed and pts: pts.append(pts[0])
                for p, q in zip(pts, pts[1:]):
                    if inside(*p) or inside(*q): segs.append((p[0], p[1], q[0], q[1], L, depth))
            elif t == 'ARC':
                c = e.dxf.center
                if inside(c.x, c.y): arcs.append((c.x, c.y, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle, L, depth))
            elif t == 'CIRCLE':
                c = e.dxf.center
                if inside(c.x, c.y): circles.append((c.x, c.y, e.dxf.radius, L, depth))
            elif t in ('TEXT', 'MTEXT'):
                p = e.dxf.insert
                if inside(p.x, p.y): texts.append(((e.plain_text() if t == 'MTEXT' else e.dxf.text).replace('\n', ' ').strip(), p.x, p.y, L))
        except Exception:
            pass
walk(doc.modelspace())
with open(sys.argv[2], 'wb') as f: pickle.dump({'sheets': SHEETS, 'segs': segs, 'arcs': arcs, 'circles': circles, 'texts': texts}, f)
print('segs', len(segs), 'arcs', len(arcs), 'circles', len(circles), 'texts', len(texts))
