"""Generate RUTRIX app icons and PWA touch icons from logo-mark."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MARK_PATH = ROOT / "mobile" / "assets" / "logo-mark.png"
ACCENT = (46, 230, 255)


def radial_bg(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    cx = cy = size / 2
    max_r = size * 0.75
    for y in range(size):
        for x in range(size):
            d = min(1.0, math.hypot(x - cx, y - cy) / max_r)
            # center brighter navy, edges near black
            r = int(14 * (1 - d) + 3 * d)
            g = int(32 * (1 - d) + 6 * d)
            b = int(58 * (1 - d) + 14 * d)
            px[x, y] = (r, g, b)
    return img


def paste_mark(
    canvas: Image.Image,
    mark: Image.Image,
    scale: float,
    glow: bool = True,
) -> Image.Image:
    out = canvas.copy()
    w, h = out.size
    target = int(min(w, h) * scale)
    ratio = target / max(mark.size)
    mw, mh = int(mark.width * ratio), int(mark.height * ratio)
    m = mark.resize((mw, mh), Image.Resampling.LANCZOS)

    x = (w - mw) // 2
    y = (h - mh) // 2

    if glow:
        glow_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        alpha = m.split()[3]
        glow_img = Image.new("RGBA", (mw, mh), ACCENT + (0,))
        glow_img.putalpha(alpha)
        glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=max(4, w // 80)))
        glow_layer.paste(glow_img, (x, y), glow_img)
        out = Image.alpha_composite(out.convert("RGBA"), glow_layer)

    out.paste(m, (x, y), m)
    return out


def make_app_icon(size: int, mark: Image.Image, scale: float = 0.58) -> Image.Image:
    bg = radial_bg(size).convert("RGBA")
    return paste_mark(bg, mark, scale, glow=True)


def make_adaptive_foreground(size: int, mark: Image.Image) -> Image.Image:
    """Android adaptive: transparent bg, mark centered in safe zone."""
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return paste_mark(fg, mark, 0.52, glow=False)


def make_splash(size: int, mark: Image.Image) -> Image.Image:
    bg = radial_bg(size).convert("RGBA")
    return paste_mark(bg, mark, 0.42, glow=True)


def save_all():
    mark = Image.open(MARK_PATH).convert("RGBA")

    outputs = {
        ROOT / "mobile" / "assets" / "icon.png": (1024, "app"),
        ROOT / "mobile" / "assets" / "adaptive-icon.png": (1024, "adaptive"),
        ROOT / "mobile" / "assets" / "splash-icon.png": (512, "splash"),
        ROOT / "backend" / "app" / "static" / "apple-touch-icon.png": (180, "app"),
        ROOT / "backend" / "app" / "static" / "icon-192.png": (192, "app"),
        ROOT / "backend" / "app" / "static" / "icon-512.png": (512, "app"),
        ROOT / "backend" / "app" / "static" / "favicon.png": (32, "app"),
    }

    for path, (size, kind) in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if kind == "app":
            img = make_app_icon(size, mark, scale=0.58 if size >= 180 else 0.62)
        elif kind == "adaptive":
            img = make_adaptive_foreground(size, mark)
        else:
            img = make_splash(size, mark)
        img = img.convert("RGBA") if kind == "adaptive" else img.convert("RGB")
        img.save(path, optimize=True)
        print(f"Wrote {path} ({size}px)")


if __name__ == "__main__":
    save_all()
