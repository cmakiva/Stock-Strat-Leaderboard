"""Daily share-preview images (the card that shows when a link is posted on social sites or in a text).

Writes one 1200x630 PNG for the home page and one per strategy:
  <out>/home.png, <out>/<strategy-id>.png

Usage: python engine/share_images.py --data site/data/results.json --out dist/share
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
PAD = 64

BG = (12, 17, 27)
PANEL = (19, 26, 39)
INK = (228, 233, 242)
MUTED = (139, 150, 169)
LINE = (34, 44, 61)
ACCENT = (91, 140, 255)
GAIN = (47, 191, 133)
LOSS = (242, 88, 75)

FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/Library/Fonts", "C:/Windows/Fonts"]
APP_NAME = "BacktestBoard"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = ["DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf"] if bold else ["DejaVuSans.ttf", "arial.ttf", "Arial.ttf"]
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def pct(v: float, signed: bool = True) -> str:
    s = f"{abs(v):.1f}%"
    if not signed:
        return ("\u2212" if v < 0 else "") + s
    return ("+" if v > 0 else "\u2212" if v < 0 else "") + s


def tone(v: float):
    return GAIN if v > 0 else LOSS if v < 0 else INK


def fit(draw: ImageDraw.ImageDraw, text: str, max_w: int, size: int, bold=True, min_size=28):
    while size > min_size:
        f = font(size, bold)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return font(min_size, bold)


def nice_date(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def pl_chart(img: Image.Image, draw: ImageDraw.ImageDraw, values: list[float], box: tuple[int, int, int, int]):
    x0, y0, x1, y1 = box
    lo, hi = min(0.0, *values), max(0.0, *values)
    span = (hi - lo) or 1.0
    n = len(values)

    def xy(i, v):
        return x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * (1 - (v - lo) / span)

    zero_y = xy(0, 0.0)[1]
    # Shade between the line and zero (green above, red below). Drawn solid on a
    # separate layer and blended once, so neighbouring slices don't overlap into stripes.
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for i in range(n - 1):
        (ax, ay), (bx, by) = xy(i, values[i]), xy(i + 1, values[i + 1])
        mid = (values[i] + values[i + 1]) / 2
        col = GAIN if mid > 0 else LOSS if mid < 0 else None
        if col:
            ld.polygon([(ax, zero_y), (ax, ay), (bx + 1, by), (bx + 1, zero_y)], fill=col + (255,))
    alpha = layer.getchannel("A").point(lambda a: 46 if a else 0)
    layer.putalpha(alpha)
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"))
    draw.line([(x0, zero_y), (x1, zero_y)], fill=LINE, width=2)
    for i in range(n - 1):
        (ax, ay), (bx, by) = xy(i, values[i]), xy(i + 1, values[i + 1])
        mid = (values[i] + values[i + 1]) / 2
        draw.line([(ax, ay), (bx, by)], fill=GAIN if mid > 0 else LOSS if mid < 0 else MUTED, width=4)
    draw.text((x1 + 12, zero_y), "0%", font=font(22), fill=MUTED, anchor="lm")


def card(data: dict, s: dict, rank: int, n: int, bench: dict, is_home: bool) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img, "RGBA")
    m = s["metrics"]

    # Header row
    d.text((PAD, PAD), APP_NAME, font=font(30, True), fill=INK, anchor="lt")
    sub = f"{data['symbol']} daily, last 12 months to {nice_date(data['period']['end'])}"
    d.text((W - PAD, PAD + 4), sub, font=font(22), fill=MUTED, anchor="rt")

    # Title
    label = (f"#1 of {n} strategies today" if is_home else f"Ranked #{rank} of {n} by total return")
    d.text((PAD, 140), label, font=font(26, True), fill=ACCENT, anchor="lt")
    name = s["name"] if not s["benchmark"] else f"Buy and hold {data['symbol']}"
    d.text((PAD, 180), name, font=fit(d, name, W - 2 * PAD, 60), fill=INK, anchor="lt")

    # Big number + comparison
    big = font(108, True)
    num = pct(m["total_return"])
    d.text((PAD, 262), num, font=big, fill=tone(m["total_return"]), anchor="lt")
    nx = PAD + d.textlength(num, font=big) + 28
    if s["benchmark"]:
        lines = ["12-month return", "the benchmark for every strategy"]
    else:
        lines = ["12-month return", f"vs. {pct(bench['metrics']['total_return'])} for buy and hold"]
    d.text((nx, 286), lines[0], font=font(28, True), fill=INK, anchor="lt")
    d.text((nx, 326), lines[1], font=font(26), fill=MUTED, anchor="lt")

    # Running P/L chart
    d.rounded_rectangle((PAD - 16, 420, W - PAD + 16, H - 40), radius=14, fill=PANEL)
    pl_chart(img, d, [p["value"] for p in s["equity"]], (PAD + 8, 444, W - PAD - 64, H - 64))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    data = json.load(open(args.data))
    strategies = sorted(data["strategies"], key=lambda r: r["metrics"]["total_return"], reverse=True)
    bench = next(s for s in strategies if s["benchmark"])
    os.makedirs(args.out, exist_ok=True)

    card(data, strategies[0], 1, len(strategies), bench, True).save(os.path.join(args.out, "home.png"), optimize=True)
    for rank, s in enumerate(strategies, start=1):
        card(data, s, rank, len(strategies), bench, False).save(os.path.join(args.out, f"{s['id']}.png"), optimize=True)
    print(f"Wrote {len(strategies) + 1} share images to {args.out}")


if __name__ == "__main__":
    main()
