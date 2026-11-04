"""Cloud sprites for the opening: soft, puffy cumulus drawn from noise (no hard edges, any size).

The site opens through these (see the preloader in index.html): when loading is done the screen is full of cloud,
the clouds part to the sides and upwards and the building appears from behind them.

    python tools/build_clouds.py

Writes public/assets/img/cloud-{1,2,3}.webp (white, soft alpha). Needs only numpy and Pillow.
"""
import numpy as np
from PIL import Image, ImageFilter

rng = np.random.default_rng(7)


def blur(a, r):
    lo, hi = a.min(), a.max()
    im = Image.fromarray(((a - lo) / (hi - lo + 1e-9) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im, float) / 255 * (hi - lo) + lo


def fbm(h, w, octaves=6):
    """fractal noise: random grids from coarse to fine, each smoothed and scaled up"""
    out = np.zeros((h, w))
    for o in range(octaves):
        cells = 2 ** (o + 2)
        g = rng.random((max(2, h * cells // w), cells))
        up = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), float) / 255
        out += up / 2 ** o
    return out / (2 - 2 ** (1 - octaves))


def cloud(w, h, puffs, seed):
    global rng
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    body = np.zeros((h, w))
    for _ in range(puffs):            # round billows heaped on a flat base, the biggest in the middle
        cx = rng.uniform(0.14, 0.86); s = (0.05 + 0.13 * (1 - abs(cx - 0.5) * 1.5)) * rng.uniform(0.75, 1.3)
        cy = 0.74 - s * w / h * rng.uniform(0.35, 1.25)
        body = np.maximum(body, np.exp(-(((xx - cx) / s) ** 2 + ((yy - cy) / (s * w / h)) ** 2) * 1.6))
    body *= np.clip((0.88 - yy) / 0.12, 0, 1)              # the flat underside of a cumulus
    n = fbm(h, w)
    dens = body * 1.1 + (n - 0.5) * 0.95
    alpha = np.clip((dens - 0.36) / 0.30, 0, 1) ** 1.2
    alpha = blur(alpha, 1.2)
    # light from above: white tops, a cool grey underside, the texture of the noise in it
    shade = np.clip(1.0 - 0.34 * np.clip((yy - 0.2) / 0.65, 0, 1) * (1.15 - body) + (n - 0.5) * 0.22, 0.58, 1)
    rgb = np.dstack([shade * 0.985, shade * 0.99, shade * 1.0]) * 255
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')


for i, (w, h, p, seed) in enumerate([(1200, 700, 16, 3), (1000, 620, 12, 11), (1300, 760, 18, 23)], 1):
    c = cloud(w, h, p, seed)
    c.save(f'public/assets/img/cloud-{i}.webp', quality=82, method=6)
    print(i, c.size)
