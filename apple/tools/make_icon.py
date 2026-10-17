#!/usr/bin/env python3
"""Maakt het app-icoon van BeheerTunr (en AccentColor) in apple/Shared/Assets.xcassets.

    python3 apple/tools/make_icon.py

Zelfde tekening als het Tunr-icoon (oranje→amber verloop, witte zendmast-golven met de frequentieschaal eronder),
iets kleiner naar linksboven, met rechtsonder een donker "beheer"-badge met staafjes en een trendlijn, zodat het
naast Tunr te herkennen is.

Uitvoer: AppIcon.appiconset (iOS 1024 + macOS 16…512 @1x/@2x), AccentColor.colorset, BeheerIcon.imageset.
"""
import json, math, pathlib
from PIL import Image, ImageDraw, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
ACCENT = (0xFF, 0x5A, 0x1F)
ACCENT2 = (0xFF, 0xB0, 0x20)
BG = (0x0A, 0x0A, 0x0C)
SS = 4  # supersampling
INFO = {"author": "xcode", "version": 1}


def gradient(w, h, c1=ACCENT, c2=ACCENT2):
    """Lineair verloop c1 (linksboven) → c2 (rechtsonder), met een zachte lichte vlek linksboven."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w + y / h) / 2
            r = math.hypot(x / w - 0.2, y / h - 0.15)
            glow = max(0.0, 1 - r / 0.75) * 0.12
            px[x, y] = tuple(int(min(255, (c1[i] * (1 - t) + c2[i] * t) + 255 * glow)) for i in range(3))
    return img


def fast_gradient(w, h, c1=ACCENT, c2=ACCENT2):
    small = gradient(max(2, w // 8), max(2, h // 8), c1, c2)
    return small.resize((w, h), Image.BICUBIC)


def symbol(S, color=(255, 255, 255, 255), needle=(10, 10, 12, 230)):
    """Wit Tunr-symbool (golven + frequentieschaal) op transparant, S×S px (al supersampled)."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S / 1024
    cx, cy = 512 * u, 430 * u
    r = 74 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    for radius, width in ((185, 58), (300, 58)):
        rr = radius * u; w = int(width * u)
        for start, end in ((-42, 42), (138, 222)):
            d.arc([cx - rr, cy - rr, cx + rr, cy + rr], start=start, end=end, fill=color, width=w)
            for ang in (start, end):
                a = math.radians(ang)
                mid = rr - w / 2
                ex, ey = cx + mid * math.cos(a), cy + mid * math.sin(a)
                d.ellipse([ex - w / 2, ey - w / 2, ex + w / 2, ey + w / 2], fill=color)
    y = 790 * u
    x0, x1 = 222 * u, 802 * u
    h = 16 * u
    d.rounded_rectangle([x0, y - h / 2, x1, y + h / 2], radius=h / 2, fill=color)
    for i in range(9):
        x = x0 + (x1 - x0) * (i + 0.5) / 9
        th = (48 if i % 2 == 0 else 28) * u
        tw = 12 * u
        d.rounded_rectangle([x - tw / 2, y - h / 2 - th - 6 * u, x + tw / 2, y - h / 2 - 6 * u], radius=tw / 2, fill=color)
    nx = 600 * u; nw = 20 * u
    d.rounded_rectangle([nx - nw / 2, y - 92 * u, nx + nw / 2, y + 46 * u], radius=nw / 2, fill=needle)
    return img


def badge(S):
    """Rechtsonder: donkere schijf met witte rand, drie staafjes in het accentverloop en een witte trendlijn."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    u = S / 1024
    cx, cy, r = 778 * u, 778 * u, 196 * u
    # schaduw
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - r, cy - r + 14 * u, cx + r, cy + r + 14 * u], fill=(0, 0, 0, 110))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18 * u)))
    d = ImageDraw.Draw(img)
    ring = 18 * u
    d.ellipse([cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring], fill=(255, 255, 255, 255))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BG + (255,))
    # staafjes (verloop)
    base = cy + 92 * u
    bw = 52 * u
    gap = 30 * u
    heights = (88, 140, 196)
    total = 3 * bw + 2 * gap
    left = cx - total / 2
    grad = fast_gradient(int(S), int(S), ACCENT, ACCENT2).convert("RGBA")
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    tops = []
    for i, hgt in enumerate(heights):
        x = left + i * (bw + gap)
        top = base - hgt * u
        md.rounded_rectangle([x, top, x + bw, base], radius=bw * 0.3, fill=255)
        tops.append((x + bw / 2, top - 34 * u))
    img.paste(grad, (0, 0), mask)
    # trendlijn met punten
    lw = int(16 * u)
    d.line(tops, fill=(255, 255, 255, 255), width=lw, joint="curve")
    for (px, py) in tops:
        pr = 17 * u
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(255, 255, 255, 255))
    return img


def app_icon(size, rounded=False):
    S = size * SS
    bg = fast_gradient(S, S).convert("RGBA")
    # Tunr-symbool iets kleiner, naar linksboven
    sym = symbol(int(S * 0.80))
    bg.alpha_composite(sym, (int(S * 0.035), int(S * 0.03)))
    bg.alpha_composite(badge(S))
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.2237, fill=255)
        out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        out.paste(bg, (0, 0), mask)
        bg = out
    return bg.resize((size, size), Image.LANCZOS)


def mac_icon(size):
    """macOS-stijl: afgeronde tegel op 824/1024 met marge en zachte schaduw."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * 824 / 1024)
    tile = app_icon(inner, rounded=True)
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    ImageDraw.Draw(shadow).rounded_rectangle([off, off + size * 0.012, off + inner, off + inner + size * 0.012],
                                            radius=inner * 0.2237, fill=(0, 0, 0, 90))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(max(1, size * 0.01))))
    canvas.alpha_composite(tile, (off, off))
    return canvas


def save(img, path):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def write_json(path, data):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def main():
    cat = root / "Shared/Assets.xcassets"
    write_json(cat / "Contents.json", {"info": INFO})
    write_json(cat / "AccentColor.colorset/Contents.json", {
        "colors": [{"idiom": "universal", "color": {"color-space": "srgb", "components": {
            "red": f"{ACCENT[0] / 255:.3f}", "green": f"{ACCENT[1] / 255:.3f}", "blue": f"{ACCENT[2] / 255:.3f}",
            "alpha": "1.000"}}}],
        "info": INFO})

    icon_dir = cat / "AppIcon.appiconset"
    images = [{"filename": "icon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}]
    big = app_icon(1024)
    save(big.convert("RGB"), icon_dir / "icon-1024.png")  # App Store: geen transparantie
    cache = {}
    for pt in (16, 32, 128, 256, 512):
        for sc in (1, 2):
            px = pt * sc
            fn = f"mac-{pt}@{sc}x.png"
            if px not in cache:
                cache[px] = mac_icon(px)
            save(cache[px], icon_dir / fn)
            images.append({"filename": fn, "idiom": "mac", "scale": f"{sc}x", "size": f"{pt}x{pt}"})
    write_json(icon_dir / "Contents.json", {"images": images, "info": INFO})

    # icoon in de app (afgerond)
    save(app_icon(512, rounded=True), cat / "BeheerIcon.imageset/icon.png")
    write_json(cat / "BeheerIcon.imageset/Contents.json",
               {"images": [{"filename": "icon.png", "idiom": "universal"}], "info": INFO})
    print("Klaar:", cat)


if __name__ == "__main__":
    main()
