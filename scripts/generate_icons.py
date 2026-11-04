#!/usr/bin/env python3
"""Genera le icone originali dell'app (PNG, ICO, ICNS) con Pillow.

Design: quadrato arrotondato scuro con lambda bianca e accento turchese —
grafica originale, nessun asset di terze parti.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "src-tauri" / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

BG = (31, 37, 48, 255)          # slate scuro
GLYPH = (229, 231, 235, 255)    # grigio chiaro
ACCENT = (20, 184, 166, 255)    # turchese

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont | None:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return None


def make_base(size: int) -> Image.Image:
    """Disegna l'icona base alla dimensione richiesta."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = max(4, int(size * 0.18))
    margin = max(1, int(size * 0.03))
    d.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=BG,
    )
    # accento: quadratino arrotondato in alto a destra
    if size >= 64:
        accent = int(size * 0.16)
        ax = size - int(size * 0.30)
        ay = int(size * 0.14)
        d.rounded_rectangle(
            [ax, ay, ax + accent, ay + accent],
            radius=max(2, accent // 4),
            fill=ACCENT,
        )
    # lambda
    font = load_font(int(size * 0.62))
    if font is not None:
        d.text(
            (size / 2, size / 2 + size * 0.02),
            "λ",
            font=font,
            fill=GLYPH,
            anchor="mm",
        )
    else:
        # fallback: lambda disegnata a mano (linee)
        w = max(2, int(size * 0.06))
        d.line([(size * 0.38, size * 0.28), (size * 0.50, size * 0.74)], fill=GLYPH, width=w)
        d.line([(size * 0.50, size * 0.74), (size * 0.62, size * 0.28)], fill=GLYPH, width=w)
        d.line([(size * 0.42, size * 0.52), (size * 0.58, size * 0.52)], fill=GLYPH, width=w)
    return img


def write_icns(sizes: dict[int, bytes], path: Path) -> None:
    """ICNS con blocchi PNG (ic13/11/12/07/08/09)."""
    types = {16: b"ic13", 32: b"ic11", 64: b"ic12", 128: b"ic07", 256: b"ic08", 512: b"ic09"}
    chunks = b""
    for size, png in sizes.items():
        ctype = types.get(size)
        if ctype is None:
            continue
        chunks += ctype + (8 + len(png)).to_bytes(4, "big") + png
    header = b"icns" + (8 + len(chunks)).to_bytes(4, "big")
    path.write_bytes(header + chunks)


def main() -> None:
    base = make_base(512)
    base.save(ICONS / "icon.png")

    for name, size in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256)]:
        base.resize((size, size), Image.LANCZOS).save(ICONS / name)

    # ICO per Windows
    base.save(
        ICONS / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # ICNS per macOS (PNG nei blocchi standard)
    pngs: dict[int, bytes] = {}
    for size in [16, 32, 64, 128, 256, 512]:
        png_path = ICONS / f"_tmp_{size}.png"
        base.resize((size, size), Image.LANCZOS).save(png_path)
        pngs[size] = png_path.read_bytes()
        png_path.unlink()
    write_icns(pngs, ICONS / "icon.icns")

    print("Icone generate in", ICONS)


if __name__ == "__main__":
    main()
