"""Quick look inside a DXF: entity types, busiest layers, extents, and titles that name floors.
python tools/dxf_inspect.py <file.dxf>"""
import sys, re, collections
from ezdxf import recover

doc, auditor = recover.readfile(sys.argv[1])
msp = doc.modelspace()
types, layers, texts = collections.Counter(), collections.Counter(), []
x0 = y0 = 1e18; x1 = y1 = -1e18
for e in msp:
    types[e.dxftype()] += 1; layers[e.dxf.layer] += 1
    if e.dxftype() in ('TEXT', 'MTEXT'):
        t = e.plain_text() if e.dxftype() == 'MTEXT' else e.dxf.text
        p = e.dxf.insert
        texts.append((t.strip(), round(p.x), round(p.y)))
        x0, y0, x1, y1 = min(x0, p.x), min(y0, p.y), max(x1, p.x), max(y1, p.y)
print('errors', len(auditor.errors), 'units', doc.header.get('$INSUNITS'), 'blocks', len(doc.blocks))
print('types', types.most_common(14))
print('layers', layers.most_common(30))
print('text extents', round(x0), round(y0), round(x1), round(y1))
pat = re.compile(r'(план|этаж|qavat|reja|экспликац|отм|кровл|подвал|разрез|фасад)', re.I)
for t, x, y in [t for t in texts if pat.search(t[0])][:60]:
    print('TITLE', repr(t[:80]), x, y)
