"""Renders the PromptForge icon: a geometric anvil with a blue forge spark on a charcoal tile.

Drawn at 4x and downsampled for smooth edges. Run: python assets/make_icon.py
"""
import math
from PIL import Image, ImageDraw, ImageFilter

S = 4096  # supersampled canvas; final master is 1024
k = S / 1024


def P(x, y):
    return (x * k, y * k)


def vgrad(size, top, bottom):
    g = Image.new("RGBA", size)
    d = ImageDraw.Draw(g)
    w, h = size
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4)))
    return g


# --- Tile -------------------------------------------------------------------
tile_mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(tile_mask).rounded_rectangle((*P(32, 32), *P(992, 992)), radius=230 * k, fill=255)
icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
icon.paste(vgrad((S, S), (32, 34, 42, 255), (12, 13, 16, 255)), (0, 0), tile_mask)

# Soft blue glow behind the spark.
glow = Image.new("L", (S, S), 0)
ImageDraw.Draw(glow).ellipse((*P(330, 70), *P(790, 530)), fill=120)
glow = glow.filter(ImageFilter.GaussianBlur(110 * k))
icon.paste(Image.new("RGBA", (S, S), (77, 124, 254, 255)), (0, 0), Image.composite(glow, Image.new("L", (S, S), 0), tile_mask))

# Hairline inner border.
border = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(border).rounded_rectangle((*P(34, 34), *P(990, 990)), radius=228 * k, outline=(255, 255, 255, 30), width=int(4 * k))
icon.alpha_composite(border)

# --- Anvil ------------------------------------------------------------------
anvil_pts = [
    (150, 452), (205, 430), (300, 418),            # horn tip curving up to the face
    (832, 418), (832, 486),                        # face (heel end)
    (770, 514), (700, 552), (690, 652),            # right taper into the waist
    (772, 706), (800, 770), (310, 770),            # base
    (338, 706), (420, 652), (412, 552),            # left waist
    (352, 512), (292, 500), (228, 486), (180, 470),  # underside of the horn
]
anvil_mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(anvil_mask).polygon([P(x, y) for x, y in anvil_pts], fill=255)

shadow_alpha = anvil_mask.filter(ImageFilter.GaussianBlur(30 * k)).point(lambda v: int(v * 0.75))
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
shadow.paste(Image.new("RGBA", (S, S), (0, 0, 0, 255)), (0, int(22 * k)), shadow_alpha)
icon.alpha_composite(shadow)

anvil = vgrad((S, S), (246, 247, 250, 255), (132, 138, 150, 255))
icon.paste(anvil, (0, 0), anvil_mask)

# Face highlight and a thin blue reflection from the spark.
face = Image.new("RGBA", (S, S), (0, 0, 0, 0))
fd = ImageDraw.Draw(face)
fd.line([P(300, 421), P(830, 421)], fill=(255, 255, 255, 255), width=int(6 * k))
fd.line([P(150, 452), P(300, 421)], fill=(255, 255, 255, 200), width=int(5 * k))
icon.alpha_composite(Image.composite(face, Image.new("RGBA", (S, S), (0, 0, 0, 0)), anvil_mask))

# --- Spark ------------------------------------------------------------------
def star(draw, cx, cy, r, color, waist=0.2):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * waist
        pts.append(P(cx + rr * math.cos(a), cy + rr * math.sin(a)))
    draw.polygon(pts, fill=color)


spark = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(spark)
star(sd, 566, 262, 158, (120, 160, 255, 255))
star(sd, 718, 170, 52, (190, 210, 255, 255), 0.26)
star(sd, 420, 180, 34, (170, 195, 255, 230), 0.28)
for x, y, r in [(652, 356, 9), (478, 350, 7), (760, 290, 6)]:
    sd.ellipse((*P(x - r, y - r), *P(x + r, y + r)), fill=(200, 215, 255, 255))

bloom = spark.filter(ImageFilter.GaussianBlur(34 * k))
icon.alpha_composite(bloom)
icon.alpha_composite(spark)
core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
star(ImageDraw.Draw(core), 566, 262, 70, (235, 241, 255, 255), 0.22)
icon.alpha_composite(core.filter(ImageFilter.GaussianBlur(3 * k)))

# --- Export -----------------------------------------------------------------
master = icon.resize((1024, 1024), Image.LANCZOS)
master.save("assets/promptforge.png")
master.resize((512, 512), Image.LANCZOS).save("src/app/icon.png")
ICO_SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
master.save("assets/promptforge.ico", sizes=ICO_SIZES)
master.save("assets/promptforge-app.ico", sizes=ICO_SIZES)  # the desktop shortcut uses this one
print("ok")
