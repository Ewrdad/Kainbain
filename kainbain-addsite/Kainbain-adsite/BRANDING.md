# Kainbain branding pack

This pack is generated FROM the app's canonical brand mark — nothing here is
reinvented. The sources of truth live in the main app:

- `frontend/public/favicon.svg` — the tiled favicon (hub core, satellite
  lanes, orbit ring, dark tile). Copied byte-for-byte to `public/favicon.svg`.
- `frontend/src/components/BrandMark.jsx` — the header/empty-state mark; its
  tile-less variant is mirrored as `public/brand/kainbain-mark-transparent.svg`.

Single source of truth for regeneration: [`scripts/generate-brand.py`](scripts/generate-brand.py).
Setup once: `python3 -m venv .venv && .venv/bin/pip install cairosvg`.
Re-run from this directory: `.venv/bin/python scripts/generate-brand.py`.

Rasterization uses CairoSVG so gradients survive; wordmark lockups and
backdrops are composited with Pillow. Lockup type uses Liberation Sans Bold,
metrically close to the site's Roboto.

## Palette (the app's accent set)

| Token  | Hex     | Meaning                                    |
| ------ | ------- | ------------------------------------------ |
| Core   | `#7bdb85` | Hub core (gradient `#8ef29b` → `#43a354`) |
| Agent  | `#9acbff` | Blue satellite lane                        |
| Human  | `#ffb77f` | Peach satellite — human review lane        |
| Stage  | `#ffb74d` | Amber satellite — stage/tooling lane       |
| Tile   | `#141414` | Dark tile (`#0b0b0b` gradient foot)        |
| Ring   | `#3f4a42` | Orbit ring                                 |
| Links  | `#4a5a4a` | Core-to-satellite connectors               |

Site type stays Roboto Variable; lockup type is Liberation Sans Bold.

## Files

Served from the site root (`/`), so favicon, manifest and social cards line up:

- `public/favicon.svg` (exact copy of the app favicon), `public/favicon.ico`,
  `public/favicon-16x16.png`, `public/favicon-32x32.png`,
  `public/favicon-48x48.png` — browser tabs
- `public/apple-touch-icon.png` — opaque, iOS home screen
- `public/icon-192.png`, `public/icon-512.png`, `public/site.webmanifest` — PWA
- `public/brand/kainbain-icon.svg` + `kainbain-icon-{256,512,1024}.png` —
  tiled icon, for docs and overlays
- `public/brand/kainbain-mark-transparent.svg` +
  `kainbain-mark-transparent-{512,1024}.png` — tile-less mark, transparent,
  for compositing over your own footage
- `public/brand/kainbain-lockup-horizontal-{dark,white}.png` — transparent,
  for headers and video lower-thirds
- `public/brand/kainbain-lockup-stacked-{dark,white}.png` — transparent,
  for thumbnails and title cards
- `public/brand/kainbain-background-{dark,light}-1920x1080.png` — simple
  solid backdrops with the centred lockup, for presenting and videos

Dark lockups are ink-on-transparent (`#141414`); white lockups are
white-on-transparent. Pick whichever contrasts with your background.

## In-page use

The hero uses [`src/components/BrandIcon.tsx`](src/components/BrandIcon.tsx),
an inline copy of the tile favicon — same file, no fetch, crisp at any size.
