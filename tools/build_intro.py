"""Opening sequence frames from the hero render: a pencil drawing (main lines, then all lines) and a white clay model.

The site opens on these (see the intro in index.html): the drawing is drawn, turns into the white model, and the
model takes on the colours of the render, which is the hero picture itself.

    python tools/build_intro.py [public/assets/img/hero-2800.webp]

Writes public/assets/img/intro-{lines,sketch,clay}-{800,1400,2200}.webp. Needs only numpy and Pillow.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/img/hero-2800.webp'
OUT = 'public/assets/img/intro-{}-{}.webp'
PAPER = np.array([243, 241, 235], float) / 255          # the cream of the opening screen
INK = np.array([62, 64, 66], float) / 255               # graphite


def blur(a, r):
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), float) / 255


def xdog(gray, sigma, k=1.6, tau=0.985, eps=-0.012, phi=60):
    """extended difference of Gaussians: pencil-like lines, dark where the image has edges"""
    d = blur(gray, sigma) - tau * blur(gray, sigma * k)
    return np.where(d >= eps, 1.0, 1 + np.tanh(phi * (d - eps)))   # 1 = paper, 0 = full line


def on_paper(lines, strength=1.0):
    t = np.clip(1 - lines, 0, 1)[..., None] * strength
    return PAPER * (1 - t) + INK * t


def save(rgb, name):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    for w in (800, 1400, 2200):
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(OUT.format(name, w), quality=78, method=6)


src = Image.open(SRC).convert('RGB')
W = 2200
src = src.resize((W, round(src.height * W / src.width)), Image.LANCZOS)
rgb = np.asarray(src, float) / 255
gray = rgb @ [0.299, 0.587, 0.114]

# main lines: a broad pass, only the strong structure (the outline, storeys, the tower, the girih panels)
lines = xdog(gray, 2.2, eps=-0.02, phi=40)
lines = np.maximum(lines, 1 - (1 - lines) * (blur(1 - lines, 1.5) > 0.12))   # drop specks
save(on_paper(lines, 0.85), 'lines')

# all lines: a finer pass on top of the main one
fine = xdog(gray, 1.0, eps=-0.008, phi=70)
save(on_paper(np.minimum(lines, 0.35 + 0.65 * fine), 0.9), 'sketch')

# white clay model: the light of the render without its colours, lifted to a warm white, the lines still faint on it
lum = blur(gray, 0.6)
lum = 0.62 + 0.38 * np.clip((lum - lum.min()) / (np.percentile(lum, 99.5) - lum.min()), 0, 1) ** 0.8
clay = np.stack([lum * 1.0, lum * 0.985, lum * 0.955], -1)
clay = clay * (0.86 + 0.14 * lines[..., None])
save(clay, 'clay')
print('ok', src.size)
