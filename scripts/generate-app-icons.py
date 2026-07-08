"""Generate Expo app icons (1024 + adaptive + splash)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "mobile" / "assets"
BG = (10, 15, 26)
ACCENT = (56, 189, 248)
ORANGE = (249, 115, 22)


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    d = ImageDraw.Draw(img)
    margin = size // 8
    d.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 6,
        fill=(26, 35, 50, 255),
        outline=ACCENT + (255,),
        width=max(2, size // 64),
    )
    hole_r = size // 5
    cx, cy = size // 2, size // 2 + size // 20
    d.ellipse(
        [cx - hole_r, cy - hole_r, cx + hole_r, cy + hole_r],
        fill=(15, 23, 42, 255),
        outline=ORANGE + (255,),
        width=max(2, size // 80),
    )
    d.ellipse(
        [cx - hole_r // 2, cy - hole_r // 2, cx + hole_r // 2, cy + hole_r // 2],
        fill=(30, 41, 59, 255),
    )
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(1024).save(OUT / "icon.png")
    draw_icon(1024).save(OUT / "adaptive-icon.png")
    splash = Image.new("RGBA", (1284, 2778), BG + (255,))
    icon = draw_icon(512)
    splash.paste(icon, ((1284 - 512) // 2, 900), icon)
    splash.save(OUT / "splash-icon.png")
    print(f"[OK] Icons saved to {OUT}")


if __name__ == "__main__":
    main()
