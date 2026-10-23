# Placeholder app icon and splash screens (forest green + cream, "h." mark). Replace with designed art before release.
# Run: python3 scripts/make-icons.py   (needs Pillow)
from PIL import Image, ImageDraw, ImageFont
import glob, os

GREEN, CREAM, CLAY = (30, 77, 58), (246, 244, 238), (194, 105, 47)
def font(size):
    for f in glob.glob("/usr/share/fonts/**/*Bold*.ttf", recursive=True) + ["/Library/Fonts/Arial Bold.ttf"]:
        try: return ImageFont.truetype(f, size)
        except Exception: pass
    return ImageFont.load_default()

def icon(size):
    im = Image.new("RGB", (size, size), GREEN)  # App Store icons must be square with no transparency
    d = ImageDraw.Draw(im); f = font(int(size * 0.58))
    w = d.textlength("h", font=f)
    x = (size - w - size * 0.16) / 2; y = size * 0.12
    d.text((x, y), "h", font=f, fill=CREAM)
    r = size * 0.075; cx = x + w + size * 0.1; cy = size * 0.70
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CLAY)
    return im

def splash(size):
    im = Image.new("RGB", (size, size), CREAM)
    d = ImageDraw.Draw(im); f = font(int(size * 0.045))
    text = "here to serve"
    w = d.textlength(text, font=f); r = size * 0.009
    x = (size - w - r * 3) / 2; y = size / 2 - size * 0.03
    d.text((x, y), text, font=f, fill=(23, 32, 27))
    d.ellipse([x + w + r, y + size * 0.042 - r, x + w + r * 3, y + size * 0.042 + r], fill=CLAY)
    return im

os.makedirs("public", exist_ok=True)
icon(1024).save("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png") if os.path.isdir("ios") else None
icon(512).save("public/icon.png")
icon(1024).save("resources/icon.png") if os.path.isdir("resources") else None
if os.path.isdir("ios"):
    for n in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]:
        splash(2732).save("ios/App/App/Assets.xcassets/Splash.imageset/" + n)
print("icons and splash written")
