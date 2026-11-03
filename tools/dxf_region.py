"""Layer / entity statistics and texts inside one rectangle of a DXF (blocks counted by their insert layer).
python tools/dxf_region.py <file.dxf> x0 y0 x1 y1"""
import sys, collections
from ezdxf import recover

path = sys.argv[1]; x0, y0, x1, y1 = map(float, sys.argv[2:6])
doc, _ = recover.readfile(path)
inside = lambda p: x0 <= p[0] <= x1 and y0 <= p[1] <= y1
stats, blocks, texts = collections.Counter(), collections.Counter(), []
for e in doc.modelspace():
    t = e.dxftype()
    try:
        if t == 'LINE': p = e.dxf.start
        elif t in ('LWPOLYLINE',): p = next(iter(e.get_points('xy')))
        elif t in ('TEXT', 'MTEXT', 'INSERT', 'DIMENSION'): p = e.dxf.get('insert') or e.dxf.get('defpoint')
        elif t in ('ARC', 'CIRCLE'): p = e.dxf.center
        elif t == 'HATCH': p = e.paths[0].vertices[0] if hasattr(e.paths[0], 'vertices') else e.paths[0].edges[0].start
        else: continue
    except Exception: continue
    if p is None or not inside(p): continue
    stats[(e.dxf.layer, t)] += 1
    if t == 'INSERT': blocks[(e.dxf.layer, e.dxf.name)] += 1
    if t in ('TEXT', 'MTEXT'): texts.append(((e.plain_text() if t == 'MTEXT' else e.dxf.text).replace('\n', ' '), round(p[0]), round(p[1]), e.dxf.layer))
print('LAYER/TYPE'); [print(f'  {n:6d} {l!r} {t}') for (l, t), n in stats.most_common(40)]
print('BLOCKS'); [print(f'  {n:6d} {l!r} {b!r}') for (l, b), n in blocks.most_common(40)]
print('TEXTS', len(texts)); [print(' ', *t) for t in texts[:150]]
