"""Convert source renders + plan board into responsive WebP set and write images.js manifest."""
import os, sys, json
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = None

SRC = sys.argv[1]            # project root (42-)
OUT = sys.argv[2]            # site root
IMG = os.path.join(OUT, 'assets', 'img')
os.makedirs(IMG, exist_ok=True)

R = lambda *p: os.path.join(SRC, *p)
SETS = {
    # id: (path, widths)
    'hero': (R('Rendr', 'Yengi RENDER', '24 (2).jpg'), [800, 1400, 2200, 2800]),
    'ext-01': (R('Rendr', 'Yengi RENDER', '6.jpg'), None),
    'ext-02': (R('Rendr', 'Yengi RENDER', '4.jpg'), None),
    'ext-03': (R('Rendr', 'Yengi RENDER', '31.jpg'), None),
    'ext-04': (R('Rendr', 'Yengi RENDER', '29.jpg'), None),
    'ext-05': (R('Rendr', 'Yengi RENDER', '21 (2).jpg'), None),
    'ext-06': (R('Rendr', 'Yengi RENDER', '27 (2).jpg'), None),
    'ext-07': (R('Rendr', 'Yengi RENDER', '30.jpg'), None),
    'det-01': (R('Rendr', 'Yengi RENDER', '10 (3).jpg'), None),
    'det-02': (R('Rendr', 'Yengi RENDER', '9 (3).jpg'), None),
    'det-03': (R('Rendr', 'Yengi RENDER', '11 (3).jpg'), None),
    'det-04': (R('Rendr', 'Yengi RENDER', '12 (3).jpg'), None),
    'lob-01': (R('Rendr', 'POL', 'F 34.jpg'), None),
    'lob-02': (R('Rendr', 'POL', 'F 33.jpg'), None),
    'lob-03': (R('Rendr', 'POL', 'F 31.jpg'), None),
    'lob-04': (R('Rendr', 'POL', 'F 38.jpg'), None),
    'lob-05': (R('Rendr', 'INTERYER POL', '12.jpg'), None),
    'lob-06': (R('Rendr', 'INTERYER POL', '2.jpg'), None),
    'lob-07': (R('Rendr', 'INTERYER POL', '13.jpg'), None),
    'lob-08': (R('Rendr', 'INTERYER POL', '14.jpg'), None),
    'lob-09': (R('Rendr', 'INTERYER POL', '3.jpg'), None),
    'lob-10': (R('Rendr', 'INTERYER POL', '4.jpg'), None),
}
for i, n in enumerate(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'], 1):
    SETS[f'var-a{i}'] = (R('Rendr', 'REN', n + '.jpg'), None)
for i, n in enumerate(['1', '2 (2)', '3 (3)', '4', '5', '6', '7', '8', '9', 'R5'], 1):
    SETS[f'var-b{i}'] = (R('Rendr', 'Yengi REN', n + '.jpg'), None)
for n in ['F3', 'F5', 'F6', 'F8', 'F1', 'F2', 'F4']:
    SETS['lobby2-' + n[1:]] = (R('Rendr', 'INTERYER', n + '.jpg'), None)
for n in range(2, 8):
    SETS[f'iso-{n}'] = (R('Rendr', 'INTERYER', f'{n}-ETAJ.jpg'), None)
for t, names in {
    'b': ['B11', 'B1', 'B3', 'B6'],
    'd': ['D11', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
    'k': ['K11', 'K1', 'K3', 'K6'],
    'y': ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10'],
}.items():
    for n in names:
        SETS[f'int-{n.lower()}'] = (R('Rendr', 'INTERYER', n + '.jpg'), None)
for i, n in enumerate(['a5 214 copy.png', 'a1 214.jpg', 'a2 214.jpg', 'a3 214.jpg', 'a4 214.jpg']):
    SETS[f'int-s{i}'] = (R('Rendr', 'INTERYER', n), None)
for i, n in enumerate(['11.jpg', '22.jpg', '33.jpg', '44.jpg', '2 2variant.jpg', '222 variant (2).jpg'], 1):
    SETS[f'int-w{i}'] = (R('Rendr', 'INTERYER', n), None)

DEFAULT_W = [640, 1280, 1920]
manifest = {}

def save_set(key, im, widths, q=76):
    im = im.convert('RGB')
    W, H = im.size
    ws = sorted({min(w, W) for w in widths})
    for w in ws:
        h = round(H * w / W)
        r = im if w == W else im.resize((w, h), Image.LANCZOS)
        r.save(os.path.join(IMG, f'{key}-{w}.webp'), 'WEBP', quality=q, method=6)
    manifest[key] = {'w': W, 'h': H, 's': ws}

for key, (path, widths) in SETS.items():
    im = ImageOps.exif_transpose(Image.open(path))
    im.draft('RGB', (3000, 3000))
    save_set(key, im, widths or DEFAULT_W)
    print('ok', key, im.size, flush=True)

# social preview (JPEG for wide compatibility)
og = Image.open(SETS['hero'][0]).convert('RGB')
og = ImageOps.fit(og, (1200, 630), Image.LANCZOS, centering=(0.5, 0.35))
og.save(os.path.join(IMG, 'og.jpg'), quality=82, optimize=True, progressive=True)

# ---- floor plans from the board (6500x8862, 1:200 => ~70.87 px/m) ----
board = Image.open(R('market', 'JPG', '2.jpg')).convert('RGB')
# axis pixels: x of axis 1 / last axis, y of axis Д / А (detected from red axis lines)
AX = {
    'b':  (588, 4036, 521, 1527),
    '1':  (2811, 6258, 2016, 3030),
    '28': (638, 4086, 3970, 4984),
    '9':  (2812, 6259, 5609, 6623),
    '10': (644, 2178, 7307, 8320),
}
# loose display crops (with titles and dimension lines)
DISP = {
    'b': (180, 120, 4230, 1800),
    '1': (2300, 1600, 6380, 3600),
    '28': (130, 3560, 4230, 5340),
    '9': (2300, 5330, 6380, 6960),
    '10': (130, 6960, 4180, 8680),
}
M = 43  # 0.6 m margin in px
plans = {}
for k, (x0, x1, yd, ya) in AX.items():
    tex = board.crop((x0 - M, yd - M, x1 + M, ya + M))
    tw = 2048 if k != '10' else 1024
    th = round(tex.height * tw / tex.width)
    tex.resize((tw, th), Image.LANCZOS).save(os.path.join(IMG, f'tex-{k}.webp'), 'WEBP', quality=86, method=6)
    save_set(f'plan-{k}', board.crop(DISP[k]), [900, 1800, 2600], q=84)
    plans[k] = {'tex': f'tex-{k}.webp', 'tw': tw, 'th': th}
    print('plan', k, flush=True)

with open(os.path.join(OUT, 'assets', 'js', 'images.js'), 'w', encoding='utf-8') as f:
    f.write('// generated by build_images.py — sizes of every responsive image in public/assets/img\n')
    f.write('export const IMG = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
print('done', len(manifest))
