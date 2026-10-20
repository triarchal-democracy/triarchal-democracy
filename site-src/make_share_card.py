# -*- coding: utf-8 -*-
"""Build site/assets/share-card.png (1200x630), the image used for link previews.

Run from the repo root:  python3 site-src/make_share_card.py

Colours are the site's own (:root in every page, and charts-src/_style.py). The face is
Lora, the serif the charts already use; it is an SIL Open Font License family loaded by
every page from Google Fonts, so nothing new is licensed. The script needs a local copy
of Lora (the variable TTF from Google Fonts) and Pillow. The line of text on the card is
deliberately modest and makes no claim about income or outcomes.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
PAPER, INK, SOFT, FAINT, RULE, ACCENT = "#faf7f2", "#1c1a17", "#4a463f", "#8a857b", "#e2dcd2", "#7a2e2e"

CANDIDATES = [
    "/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf",
    "/usr/share/fonts/truetype/lora/Lora-Variable.ttf",
    os.path.expanduser("~/Library/Fonts/Lora-Variable.ttf"),
    "C:/Windows/Fonts/Lora-Variable.ttf",
]
path = next((p for p in CANDIDATES if os.path.exists(p)), None)
if not path:
    sys.exit("Lora-Variable.ttf not found; install Lora (Google Fonts, OFL) and rerun.")

def font(size, weight):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

# left accent bar and a thin frame, as the pages use accent + rule colours
d.rectangle([0, 0, 14, H], fill=ACCENT)
d.rectangle([14, 0, W - 1, H - 1], outline=RULE, width=2)

x = 96
d.text((x, 104), "A PROPOSED STRUCTURE FOR GOVERNANCE", font=font(24, 600), fill=ACCENT)

d.text((x, 154), "Triarchal", font=font(124, 600), fill=INK)
d.text((x, 276), "Democracy", font=font(124, 600), fill=INK)

d.rectangle([x, 432, x + 96, 435], fill=ACCENT)

d.text((x, 462), "One member, one vote. A public record of every decision.", font=font(34, 400), fill=SOFT)

url = "triarchal-democracy.vercel.app"
d.text((x, H - 80), url, font=font(24, 500), fill=FAINT)

out = os.path.join("site", "assets", "share-card.png")
img.save(out, optimize=True)
print("wrote", out, img.size)
