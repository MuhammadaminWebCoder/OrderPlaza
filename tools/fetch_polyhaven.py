"""Download CC0 textures / models / HDRI from Poly Haven and shrink them for the web.
Usage: python fetch_polyhaven.py <site_root> <cache_dir>"""
import sys, os, json, io, struct, urllib.request
import numpy as np
from PIL import Image

SITE, CACHE = sys.argv[1], sys.argv[2]
TEX_OUT = os.path.join(SITE, 'assets', 'tex')
MOD_OUT = os.path.join(SITE, 'assets', 'models')
os.makedirs(TEX_OUT, exist_ok=True); os.makedirs(MOD_OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)

def get(url):
    fn = os.path.join(CACHE, url.split('/')[-1])
    if not os.path.exists(fn):
        req = urllib.request.Request(url, headers={'User-Agent': 'OrderPlazaSite/1.0'})
        with urllib.request.urlopen(req, timeout=120) as r, open(fn, 'wb') as f: f.write(r.read())
    return fn

def files(asset):
    req = urllib.request.Request(f'https://api.polyhaven.com/files/{asset}', headers={'User-Agent': 'OrderPlazaSite/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)

# name in site -> (poly haven id, None or (grey mean, contrast): desaturate so vertex colours can tint it)
TEXTURES = {
    'parquet': ('herringbone_parquet', None), 'marble': ('marble_01', None), 'tiles': ('long_white_tiles', None),
    'stone': ('grey_cartago_01', None), 'concrete': ('concrete_floor_01', None), 'plaster': ('plastered_wall_04', (240, 0.3)),
    'oak': ('oak_veneer_01', None), 'fabric': ('caban', (205, 1.0)), 'leather': ('leather_white', (215, 1.0)),
}
for name, (pid, grey) in TEXTURES.items():
    f = files(pid)
    for kind, key, size in (('diff', 'Diffuse', 512), ('nor', 'nor_gl', 512), ('rough', 'Rough', 256)):
        if key not in f: continue
        im = Image.open(get(f[key]['1k']['jpg']['url']))
        im = im.convert('L' if kind == 'rough' else 'RGB').resize((size, size), Image.LANCZOS)
        if kind == 'diff' and grey:
            a = np.asarray(im.convert('L')).astype(np.float32)
            a = np.clip(grey[0] + (a - a.mean()) * grey[1] * grey[0] / max(1, a.mean()), 0, 255).astype(np.uint8)
            im = Image.fromarray(a).convert('RGB')
        im.save(os.path.join(TEX_OUT, f'{name}_{kind}.webp'), 'WEBP', quality=82, method=6)
    print('tex', name, flush=True)

# models: keep glTF + bin, shrink every texture to 512 px (same file names, so the .gltf stays valid)
MODELS = ['calathea_orbifolia_01', 'modern_arm_chair_01', 'sofa_03', 'side_table_01', 'modern_coffee_table_01']
for pid in MODELS:
    g = files(pid)['gltf']['1k']['gltf']
    out = os.path.join(MOD_OUT, pid); os.makedirs(out, exist_ok=True)
    with open(get(g['url']), 'rb') as src, open(os.path.join(out, pid + '.gltf'), 'wb') as dst: dst.write(src.read())
    for rel, meta in g.get('include', {}).items():
        dest = os.path.join(out, rel); os.makedirs(os.path.dirname(dest), exist_ok=True)
        data = get(meta['url'])
        if rel.lower().endswith(('.jpg', '.jpeg', '.png')):
            im = Image.open(data); im.thumbnail((512, 512), Image.LANCZOS)
            if rel.lower().endswith('.png'): im.save(dest, optimize=True)
            else: im.convert('RGB').save(dest, quality=82, optimize=True)
        else:
            with open(data, 'rb') as s, open(dest, 'wb') as d: d.write(s.read())
    print('model', pid, flush=True)

# HDRI: read Radiance RGBE (new-style RLE), downsample to 512×256, write uncompressed RGBE
def read_hdr(fn):
    b = open(fn, 'rb').read(); p = b.index(b'\n\n') + 2
    line_end = b.index(b'\n', p); dims = b[p:line_end].split(); h, w = int(dims[1]), int(dims[3]); p = line_end + 1
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        p += 4  # 2 2 hi lo
        for c in range(4):
            x = 0
            while x < w:
                n = b[p]; p += 1
                if n > 128: n -= 128; img[y, x:x + n, c] = b[p]; p += 1
                else: img[y, x:x + n, c] = np.frombuffer(b[p:p + n], np.uint8); p += n
                x += n
    e = img[..., 3].astype(np.int32)
    f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float32) * f[..., None]
def write_hdr(fn, rgb):
    h, w, _ = rgb.shape; m = rgb.max(-1)
    mant, ex = np.frexp(m); scale = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb * scale[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    with open(fn, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode()); f.write(out.tobytes())
hdr = read_hdr(get(files('clarens_midday')['hdri']['1k']['hdr']['url']))
small = hdr.reshape(256, 2, 512, 2, 3).mean((1, 3))
write_hdr(os.path.join(TEX_OUT, 'sky.hdr'), small)
print('hdri done')
