#!/usr/bin/env python3
"""Kainbain branding pack — generated FROM the app's canonical brand mark.

The mark lives in the main app and is the single source of truth:
  frontend/public/favicon.svg        (tiled favicon, gradients included)
  frontend/src/components/BrandMark.jsx  (transparent variant, tile=false)

This script copies that geometry pixel-exactly (no reinvention): the tile SVG
is read from the frontend file, the transparent master mirrors BrandMark.jsx,
and both are rasterized with CairoSVG so gradients survive. Wordmark lockups
and backdrops are composited with Pillow.

Setup once:  python3 -m venv .venv && .venv/bin/pip install cairosvg
Run from the ad-site root:  .venv/bin/python scripts/generate-brand.py
"""
import os
import shutil
import cairosvg
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ADSITE = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(ADSITE))
PUBLIC = os.path.join(ADSITE, "public")
BRAND = os.path.join(PUBLIC, "brand")

TILE_SVG_SRC = os.path.join(REPO, "frontend", "public", "favicon.svg")

INK = "#141414"   # app tile black — dark lockup text, video backdrop
WHITE = "#FFFFFF"
FONT = "/usr/share/truetype/liberation/LiberationSans-Bold.ttf"

# Transparent master: BrandMark.jsx with tile=false, flattened
# (var(--accent-hex, #7bdb85) resolved to its fallback).
MARK_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="KainBain">
<g transform="rotate(-90 64 64)">
<circle cx="64" cy="64" r="40" fill="none" stroke="#3f4a42" stroke-width="3"/>
<circle cx="64" cy="64" r="40" fill="none" stroke="#7bdb85" stroke-width="3" stroke-linecap="round" stroke-dasharray="56 195.33" opacity="0.9"/>
</g>
<g stroke="#4a5a4a" stroke-width="2" stroke-linecap="round">
<line x1="64" y1="64" x2="64" y2="24"/>
<line x1="64" y1="64" x2="98.64" y2="44"/>
<line x1="64" y1="64" x2="29.36" y2="44"/>
</g>
<circle cx="64" cy="64" r="24" fill="#7bdb85"/>
<circle cx="64" cy="64" r="24" fill="none" stroke="#00531c" stroke-opacity="0.55" stroke-width="2.5"/>
<circle cx="56" cy="56" r="6" fill="#ffffff" opacity="0.3"/>
<circle cx="64" cy="24" r="8" fill="#9acbff"/>
<circle cx="98.64" cy="44" r="8" fill="#ffb77f"/>
<circle cx="29.36" cy="44" r="8" fill="#ffb74d"/>
</svg>
"""


def svg_png(svg, size, out, bg=None):
    kwargs = {"bytestring": svg.encode(), "write_to": out,
              "output_width": size, "output_height": size}
    if bg is not None:
        kwargs["background_color"] = bg
    cairosvg.svg2png(**kwargs)


def opaque(img, bg):
    base = Image.new("RGBA", img.size, bg)
    base.alpha_composite(img)
    return base.convert("RGB")


def wordmark(draw, xy, size, fill):
    return draw.text(xy, "kainbain", font=ImageFont.truetype(FONT, size), fill=fill)


def lockup(mark, stacked, fill):
    gap, pad, fs = 110, 130, 300
    icon = mark.height
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    fnt = ImageFont.truetype(FONT, fs)
    box = probe.textbbox((0, 0), "kainbain", font=fnt)
    tw, th = box[2] - box[0], box[3] - box[1]
    if stacked:
        w, h = max(icon, tw) + 2 * pad, icon + gap + th + 2 * pad
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.alpha_composite(mark, ((w - icon) // 2, pad))
        d = ImageDraw.Draw(img)
        wordmark(d, ((w - tw) // 2 - box[0], pad + icon + gap - box[1]), fs, fill)
    else:
        w, h = pad + icon + gap + tw + pad, max(icon, th) + 2 * pad
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.alpha_composite(mark, (pad, (h - icon) // 2))
        d = ImageDraw.Draw(img)
        wordmark(d, (pad + icon + gap - box[0], (h - th) // 2 - box[1]), fs, fill)
    return img


def background(dark):
    img = Image.new("RGB", (1920, 1080), INK if dark else WHITE)
    mark = Image.open(os.path.join(BRAND, "kainbain-mark-transparent-1024.png"))
    mark.thumbnail((680, 680), Image.LANCZOS)
    wm = lockup(mark, True, WHITE if dark else INK)
    wm.thumbnail((760, 760), Image.LANCZOS)
    img.paste(wm, ((1920 - wm.width) // 2, (1080 - wm.height) // 2),
              wm if wm.mode == "RGBA" else None)
    return img


def main():
    os.makedirs(BRAND, exist_ok=True)
    with open(TILE_SVG_SRC, encoding="utf-8") as f:
        tile_svg = f.read()
    with open(os.path.join(PUBLIC, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(tile_svg)
    with open(os.path.join(BRAND, "kainbain-icon.svg"), "w", encoding="utf-8") as f:
        f.write(tile_svg)
    with open(os.path.join(BRAND, "kainbain-mark-transparent.svg"), "w", encoding="utf-8") as f:
        f.write(MARK_SVG)

    tile = tile_svg
    svg_png(tile, 1024, os.path.join(BRAND, "kainbain-icon-1024.png"))
    svg_png(tile, 512, os.path.join(BRAND, "kainbain-icon-512.png"))
    svg_png(tile, 256, os.path.join(BRAND, "kainbain-icon-256.png"))
    svg_png(tile, 192, os.path.join(PUBLIC, "icon-192.png"))
    svg_png(tile, 512, os.path.join(PUBLIC, "icon-512.png"))
    svg_png(tile, 48, os.path.join(PUBLIC, "favicon-48x48.png"))
    svg_png(tile, 32, os.path.join(PUBLIC, "favicon-32x32.png"))
    svg_png(tile, 16, os.path.join(PUBLIC, "favicon-16x16.png"))
    svg_png(tile, 180, os.path.join(PUBLIC, "apple-touch-icon.png"), bg=INK)
    Image.open(os.path.join(BRAND, "kainbain-icon-1024.png")).resize(
        (48, 48), Image.LANCZOS).save(os.path.join(PUBLIC, "favicon.ico"),
                                      sizes=[(16, 16), (32, 32), (48, 48)])

    svg_png(MARK_SVG, 1024, os.path.join(BRAND, "kainbain-mark-transparent-1024.png"))
    svg_png(MARK_SVG, 512, os.path.join(BRAND, "kainbain-mark-transparent-512.png"))
    mark = Image.open(os.path.join(BRAND, "kainbain-mark-transparent-1024.png"))
    for name, stacked, fill in [
        ("kainbain-lockup-horizontal-dark", False, INK),
        ("kainbain-lockup-horizontal-white", False, WHITE),
        ("kainbain-lockup-stacked-dark", True, INK),
        ("kainbain-lockup-stacked-white", True, WHITE),
    ]:
        lockup(mark, stacked, fill).save(os.path.join(BRAND, name + ".png"))
    background(True).save(os.path.join(BRAND, "kainbain-background-dark-1920x1080.png"))
    background(False).save(os.path.join(BRAND, "kainbain-background-light-1920x1080.png"))
    print("brand pack written to", BRAND, "from", TILE_SVG_SRC)


if __name__ == "__main__":
    shutil.rmtree(BRAND, ignore_errors=True)
    main()
