"""Draw the standalone mount demo sheets. Seats match data/mount-demo/mounts.json."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "assets" / "mount-demo"
CELL_W, CELL_H = 280, 220
SCALE = 2
CX, FEET = 140, 206


def new_sheet():
    img = Image.new("RGBA", (CELL_W * 3 * SCALE, CELL_H * SCALE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def cell(index):
    return index * CELL_W * SCALE, 0


def pt(ox, x, y):
    return ox + x * SCALE, y * SCALE


def ellipse(draw, ox, box, fill, outline=None):
    x0, y0, x1, y1 = box
    draw.ellipse([ox + x0 * SCALE, y0 * SCALE, ox + x1 * SCALE, y1 * SCALE], fill=fill, outline=outline)


def polygon(draw, ox, points, fill):
    draw.polygon([pt(ox, x, y) for x, y in points], fill=fill)


def saddle(draw, ox, x, y):
    ellipse(draw, ox, (x - 16, y - 8, x + 16, y + 8), (196, 122, 62, 255), (120, 72, 32, 255))


def save(img, name):
    out = img.resize((CELL_W * 3, CELL_H), Image.Resampling.LANCZOS)
    path = ROOT / name
    out.save(path, "WEBP", lossless=True, exact=True, method=6)
    print(f"{name} {path.stat().st_size}")


def dragon():
    back, bd = new_sheet()
    front, fd = new_sheet()
    for i, facing in enumerate(("down", "left", "up")):
        ox, _ = cell(i)
        if facing == "down":
            ellipse(bd, ox, (28, 48, 252, 150), (61, 158, 98, 255))
            ellipse(bd, ox, (70, 150, 120, 206), (46, 120, 74, 255))
            ellipse(bd, ox, (160, 150, 210, 206), (46, 120, 74, 255))
            saddle(bd, ox, 140, 110)
            ellipse(fd, ox, (94, 132, 186, 204), (47, 130, 78, 255))
            ellipse(fd, ox, (112, 146, 132, 166), (20, 20, 20, 255))
            ellipse(fd, ox, (148, 146, 168, 166), (20, 20, 20, 255))
        elif facing == "left":
            polygon(bd, ox, [(200, 150), (250, 120), (246, 168), (190, 176)], (46, 120, 74, 255))
            ellipse(bd, ox, (96, 118, 236, 186), (61, 158, 98, 255))
            ellipse(bd, ox, (120, 168, 150, 208), (46, 120, 74, 255))
            ellipse(bd, ox, (176, 168, 206, 208), (46, 120, 74, 255))
            saddle(bd, ox, 176, 114)
            polygon(fd, ox, [(150, 130), (96, 118), (88, 150), (140, 156)], (47, 130, 78, 255))
            ellipse(fd, ox, (48, 86, 128, 156), (47, 130, 78, 255))
            ellipse(fd, ox, (70, 108, 84, 122), (20, 20, 20, 255))
            polygon(fd, ox, [(78, 78), (96, 48), (108, 86)], (232, 212, 139, 255))
        else:
            ellipse(bd, ox, (40, 36, 240, 120), (61, 158, 98, 255))
            ellipse(bd, ox, (108, 70, 172, 150), (215, 236, 190, 255))
            ellipse(bd, ox, (78, 150, 124, 206), (46, 120, 74, 255))
            ellipse(bd, ox, (156, 150, 202, 206), (46, 120, 74, 255))
            saddle(bd, ox, 140, 106)
    save(back, "dragon-back.webp")
    save(front, "dragon-front.webp")


def car():
    back, bd = new_sheet()
    front, fd = new_sheet()
    body = (212, 82, 74, 255)
    dark = (42, 46, 51, 255)
    glass = (185, 231, 246, 230)
    for i, facing in enumerate(("down", "left", "up")):
        ox, _ = cell(i)
        if facing == "down":
            ellipse(bd, ox, (48, 168, 92, 208), dark)
            ellipse(bd, ox, (188, 168, 232, 208), dark)
            polygon(bd, ox, [(70, 168), (210, 168), (226, 128), (54, 128)], body)
            saddle(bd, ox, 140, 148)
            polygon(fd, ox, [(78, 150), (202, 150), (214, 118), (66, 118)], glass)
            polygon(fd, ox, [(60, 124), (220, 124), (232, 108), (48, 108)], body)
        elif facing == "left":
            ellipse(bd, ox, (58, 156, 98, 204), dark)
            ellipse(bd, ox, (176, 156, 220, 204), dark)
            polygon(bd, ox, [(46, 156), (236, 156), (228, 112), (168, 96), (96, 108), (52, 128)], body)
            saddle(bd, ox, 134, 152)
            polygon(fd, ox, [(108, 148), (168, 148), (176, 112), (118, 108)], glass)
            polygon(fd, ox, [(40, 132), (108, 118), (100, 104), (48, 112)], body)
        else:
            ellipse(bd, ox, (52, 168, 96, 208), dark)
            ellipse(bd, ox, (184, 168, 228, 208), dark)
            polygon(bd, ox, [(64, 170), (216, 170), (230, 112), (50, 112)], body)
            saddle(bd, ox, 140, 146)
            polygon(fd, ox, [(96, 128), (184, 128), (176, 108), (104, 108)], (90, 96, 98, 255))
    save(back, "car-back.webp")
    save(front, "car-front.webp")


def carpet():
    img, draw = new_sheet()
    cloth = (214, 92, 74, 255)
    edge = (244, 208, 120, 255)
    for i, facing in enumerate(("down", "left", "up")):
        ox, _ = cell(i)
        if facing == "left":
            ellipse(draw, ox, (24, 150, 256, 196), cloth)
            ellipse(draw, ox, (36, 158, 244, 188), edge)
            saddle(draw, ox, 140, 182)
        else:
            ellipse(draw, ox, (48, 132, 232, 196), cloth)
            ellipse(draw, ox, (64, 144, 216, 184), edge)
            saddle(draw, ox, 140, 178 if facing == "down" else 178)
    save(img, "carpet.webp")


def wings():
    img, draw = new_sheet()
    feather = (236, 244, 255, 255)
    mid = (186, 214, 245, 255)
    for i, facing in enumerate(("down", "left", "up")):
        ox, _ = cell(i)
        if facing == "left":
            polygon(draw, ox, [(150, 120), (250, 40), (246, 90), (200, 130), (248, 160), (150, 150)], feather)
            polygon(draw, ox, [(150, 130), (40, 70), (70, 130), (36, 180), (150, 160)], mid)
        else:
            polygon(draw, ox, [(140, 110), (36, 28), (70, 100), (24, 150), (140, 150)], feather)
            polygon(draw, ox, [(140, 110), (244, 28), (210, 100), (256, 150), (140, 150)], mid)
        saddle(draw, ox, 144 if facing == "left" else 140, 200 if facing == "left" else 200)
    save(img, "wings.webp")


def rider():
    # Tight frame: head at the top, feet at the bottom, so crop keeps the upper body.
    rw, rh = 160, 200
    img = Image.new("RGBA", (rw * 3 * SCALE, rh * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    skin = (240, 201, 160, 255)
    hair = (90, 58, 40, 255)
    tunic = (61, 126, 201, 255)
    pants = (70, 86, 120, 255)

    def e(ox, box, fill):
        x0, y0, x1, y1 = box
        draw.ellipse([ox + x0 * SCALE, y0 * SCALE, ox + x1 * SCALE, y1 * SCALE], fill=fill)

    for i, facing in enumerate(("down", "left", "up")):
        ox = i * rw * SCALE
        e(ox, (62, 150, 84, 196), pants)
        e(ox, (76, 150, 98, 196), pants)
        e(ox, (48, 78, 112, 158), tunic)
        if facing == "left":
            e(ox, (46, 16, 108, 84), skin)
            e(ox, (40, 12, 90, 70), hair)
            e(ox, (58, 46, 70, 58), (20, 20, 20, 255))
        elif facing == "up":
            e(ox, (48, 14, 112, 86), hair)
        else:
            e(ox, (48, 14, 112, 86), skin)
            e(ox, (52, 8, 108, 52), hair)
            e(ox, (62, 44, 74, 56), (20, 20, 20, 255))
            e(ox, (86, 44, 98, 56), (20, 20, 20, 255))
    out = img.resize((rw * 3, rh), Image.Resampling.LANCZOS)
    path = ROOT / "rider.webp"
    out.save(path, "WEBP", lossless=True, exact=True, method=6)
    print(f"rider.webp {path.stat().st_size}")


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    dragon()
    car()
    carpet()
    wings()
    rider()
