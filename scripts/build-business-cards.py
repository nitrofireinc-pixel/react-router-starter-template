#!/usr/bin/env python3
"""Build printable East Forsyth Band business-card sheets (letter, 10-up).

Outputs a two-page PDF:
  page 1 — fronts
  page 2 — backs (columns mirrored for long-edge duplex)

Also writes single-card preview PNGs under /opt/cursor/artifacts/screenshots
when that directory exists.
"""

from __future__ import annotations

import io
import tarfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import Color, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT_PDF = ROOT / "assets/downloads/efhsband-business-cards.pdf"
OUT_HTML = ROOT / "business-cards.html"
QR_PATH = ROOT / "assets/site-home-qr.png"
LOGO_PATH = ROOT / "assets/efhs-logo.png"
MARK_PATH = ROOT / "assets/efhs-blue-regiment-mark.png"
FONTS_DIR = Path("/tmp/bc-fonts")
PREVIEW_DIR = Path("/opt/cursor/artifacts/screenshots")

NAVY = Color(0 / 255, 33 / 255, 66 / 255)
GOLD = Color(253 / 255, 215 / 255, 3 / 255)
RED = Color(231 / 255, 19 / 255, 33 / 255)
SOFT_BLUE = Color(199 / 255, 219 / 255, 242 / 255)

PAGE_W, PAGE_H = letter
CARD_W, CARD_H = 3.5 * inch, 2.0 * inch
COLS, ROWS = 2, 5
MARGIN_X = 0.75 * inch
MARGIN_Y = 0.5 * inch


def ensure_fonts() -> dict[str, str]:
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    needed = {
        "WorkSans-Regular": "WorkSans-Regular.ttf",
        "WorkSans-SemiBold": "WorkSans-SemiBold.ttf",
        "WorkSans-Bold": "WorkSans-Bold.ttf",
        "WorkSans-Black": "WorkSans-Black.ttf",
    }
    missing = [name for name, file in needed.items() if not (FONTS_DIR / file).exists()]
    if missing:
        tgz = Path("/tmp/work-sans.tgz")
        if not tgz.exists():
            urllib.request.urlretrieve(
                "https://github.com/googlefonts/work-sans/archive/refs/heads/main.tar.gz",
                tgz,
            )
        with tarfile.open(tgz, "r:gz") as tar:
            for member in tar.getmembers():
                base = Path(member.name).name
                if base in needed.values():
                    src = tar.extractfile(member)
                    if src is None:
                        continue
                    (FONTS_DIR / base).write_bytes(src.read())

    for name, file in needed.items():
        pdfmetrics.registerFont(TTFont(name, str(FONTS_DIR / file)))
    return {
        "regular": "WorkSans-Regular",
        "semibold": "WorkSans-SemiBold",
        "bold": "WorkSans-Bold",
        "black": "WorkSans-Black",
    }


def black_to_transparent(im: Image.Image, threshold: int = 18) -> Image.Image:
    px = im.convert("RGBA")
    data = list(px.getdata())
    out = []
    for r, g, b, a in data:
        if r <= threshold and g <= threshold and b <= threshold:
            out.append((r, g, b, 0))
        else:
            out.append((r, g, b, a))
    px.putdata(out)
    return px


def pil_to_reader(im: Image.Image, max_w: int | None = None, max_h: int | None = None) -> tuple[ImageReader, tuple[int, int]]:
    img = im.copy()
    if max_w or max_h:
        img.thumbnail((max_w or 10_000, max_h or 10_000), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf), img.size


def card_origin(col: int, row: int) -> tuple[float, float]:
    x = MARGIN_X + col * CARD_W
    y = PAGE_H - MARGIN_Y - (row + 1) * CARD_H
    return x, y


def draw_cut_guides(c: canvas.Canvas) -> None:
    c.saveState()
    c.setStrokeColor(Color(0.78, 0.81, 0.85))
    c.setDash(1, 2)
    c.setLineWidth(0.35)
    for col in range(COLS + 1):
        x = MARGIN_X + col * CARD_W
        c.line(x, MARGIN_Y - 8, x, PAGE_H - MARGIN_Y + 8)
    for row in range(ROWS + 1):
        y = PAGE_H - MARGIN_Y - row * CARD_H
        c.line(MARGIN_X - 8, y, PAGE_W - MARGIN_X + 8, y)
    c.restoreState()


def draw_front_card(c: canvas.Canvas, x: float, y: float, fonts: dict[str, str], logo_im: Image.Image, mark_im: Image.Image) -> None:
    c.setFillColor(NAVY)
    c.rect(x, y, CARD_W, CARD_H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(x, y + CARD_H - 5.5, CARD_W, 5.5, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(x, y + CARD_H - 7.5, CARD_W, 2, fill=1, stroke=0)

    logo_reader, (lw, lh) = pil_to_reader(logo_im, max_w=220, max_h=140)
    mark_reader, _ = pil_to_reader(mark_im, max_w=180, max_h=180)
    mark_w = 0.68 * inch
    mark_h = mark_w
    logo_w = 0.82 * inch
    logo_h = logo_w * (lh / float(lw))
    gap = 12
    total = logo_w + gap + mark_w
    lx = x + (CARD_W - total) / 2
    ly = y + CARD_H - 1.02 * inch
    c.drawImage(logo_reader, lx, ly + (mark_h - logo_h) / 2, width=logo_w, height=logo_h, mask="auto", preserveAspectRatio=True)
    c.drawImage(mark_reader, lx + logo_w + gap, ly, width=mark_w, height=mark_h, mask="auto", preserveAspectRatio=True)

    c.setFillColor(white)
    c.setFont(fonts["black"], 15)
    c.drawCentredString(x + CARD_W / 2, y + 0.78 * inch, "East Forsyth Band")

    rule_w = 1.35 * inch
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.4)
    c.line(x + (CARD_W - rule_w) / 2, y + 0.68 * inch, x + (CARD_W + rule_w) / 2, y + 0.68 * inch)

    c.setFillColor(GOLD)
    c.setFont(fonts["bold"], 12)
    c.drawCentredString(x + CARD_W / 2, y + 0.42 * inch, "efhsband.org")

    c.setFillColor(SOFT_BLUE)
    c.setFont(fonts["semibold"], 8)
    c.drawCentredString(x + CARD_W / 2, y + 0.22 * inch, "BLUE REGIMENT")


def draw_back_card(c: canvas.Canvas, x: float, y: float, fonts: dict[str, str], qr_im: Image.Image) -> None:
    c.setFillColor(white)
    c.rect(x, y, CARD_W, CARD_H, fill=1, stroke=0)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.15)
    inset = 8
    c.rect(x + inset, y + inset, CARD_W - 2 * inset, CARD_H - 2 * inset, fill=0, stroke=1)

    qr_reader, _ = pil_to_reader(qr_im, max_w=420, max_h=420)
    qr_size = 1.15 * inch
    qx = x + (CARD_W - qr_size) / 2
    qy = y + 0.52 * inch
    c.drawImage(qr_reader, qx, qy, width=qr_size, height=qr_size, preserveAspectRatio=True)

    c.setFillColor(NAVY)
    c.setFont(fonts["black"], 13)
    c.drawCentredString(x + CARD_W / 2, y + 0.24 * inch, "Check Us Out!")


def write_pdf(fonts: dict[str, str], logo_im: Image.Image, mark_im: Image.Image, qr_im: Image.Image) -> None:
    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PDF), pagesize=letter)
    c.setTitle("East Forsyth Band — Business Cards")
    c.setAuthor("East Forsyth Band")

    draw_cut_guides(c)
    for row in range(ROWS):
        for col in range(COLS):
            x, y = card_origin(col, row)
            draw_front_card(c, x, y, fonts, logo_im, mark_im)
    c.showPage()

    # Mirror columns for long-edge duplex so backs align with fronts.
    draw_cut_guides(c)
    for row in range(ROWS):
        for col in range(COLS):
            print_col = (COLS - 1) - col
            x, y = card_origin(print_col, row)
            # Keep visual content identical; only sheet placement is mirrored.
            draw_back_card(c, x, y, fonts, qr_im)
    # Actually: for long-edge flip, card at front (col0,row0) lands under back (col1,row0)
    # when sheet flips. So back sheet should place the back design for front's col0 into col1.
    # The loop above already places every cell with back design after swapping columns —
    # since all cards are identical, mirroring is a no-op for content alignment. Keep it
    # for correctness if cards ever become unique.
    c.showPage()
    c.save()


def load_pil_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = FONTS_DIR / name
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default()


def write_previews(logo_im: Image.Image, mark_im: Image.Image, qr_im: Image.Image) -> None:
    if not PREVIEW_DIR.exists():
        return
    dpi = 300
    w, h = int(3.5 * dpi), int(2.0 * dpi)

    front = Image.new("RGB", (w, h), (0, 33, 66))
    draw = ImageDraw.Draw(front)
    draw.rectangle([0, 0, w, int(0.075 * dpi)], fill=(253, 215, 3))
    draw.rectangle([0, int(0.075 * dpi), w, int(0.075 * dpi) + int(0.028 * dpi)], fill=(231, 19, 33))

    mark = mark_im.copy()
    mark.thumbnail((int(0.68 * dpi), int(0.68 * dpi)), Image.LANCZOS)
    logo = logo_im.copy()
    logo.thumbnail((int(0.82 * dpi), int(0.82 * dpi)), Image.LANCZOS)
    gap = int(0.14 * dpi)
    total = logo.width + gap + mark.width
    lx = (w - total) // 2
    ly = int(0.32 * dpi)
    front.paste(logo, (lx, ly + (mark.height - logo.height) // 2), logo)
    front.paste(mark, (lx + logo.width + gap, ly), mark)

    def center_text(img_draw: ImageDraw.ImageDraw, text: str, y: int, font, fill) -> None:
        bbox = img_draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        img_draw.text(((w - tw) / 2, y), text, font=font, fill=fill)

    center_text(draw, "East Forsyth Band", int(1.22 * dpi), load_pil_font("WorkSans-Black.ttf", int(0.20 * dpi)), (255, 255, 255))
    rw = int(1.35 * dpi)
    ry = int(1.48 * dpi)
    draw.rectangle([(w - rw) // 2, ry, (w + rw) // 2, ry + 3], fill=(253, 215, 3))
    center_text(draw, "efhsband.org", int(1.55 * dpi), load_pil_font("WorkSans-Bold.ttf", int(0.155 * dpi)), (253, 215, 3))
    center_text(draw, "BLUE REGIMENT", int(1.78 * dpi), load_pil_font("WorkSans-SemiBold.ttf", int(0.10 * dpi)), (199, 219, 242))
    front_path = PREVIEW_DIR / "business-card-front.png"
    front.save(front_path)

    back = Image.new("RGB", (w, h), (255, 255, 255))
    d2 = ImageDraw.Draw(back)
    inset = int(0.09 * dpi)
    d2.rectangle([inset, inset, w - inset, h - inset], outline=(0, 33, 66), width=3)
    qsize = int(1.15 * dpi)
    qr = qr_im.resize((qsize, qsize), Image.NEAREST)
    back.paste(qr, ((w - qsize) // 2, int(0.28 * dpi)))
    center_text(d2, "Check Us Out!", int(1.55 * dpi), load_pil_font("WorkSans-Black.ttf", int(0.17 * dpi)), (0, 33, 66))
    back_path = PREVIEW_DIR / "business-card-back.png"
    back.save(back_path)

    sheet = Image.new("RGB", (int(8.5 * 150), int(11 * 150)), (255, 255, 255))
    cw, ch = int(3.5 * 150), int(2.0 * 150)
    mx, my = int(0.75 * 150), int(0.5 * 150)
    front_s = front.resize((cw, ch), Image.LANCZOS)
    for r in range(5):
        for col in range(2):
            sheet.paste(front_s, (mx + col * cw, my + r * ch))
    sheet.save(PREVIEW_DIR / "business-cards-sheet-front.png")

    sheet_b = Image.new("RGB", (int(8.5 * 150), int(11 * 150)), (255, 255, 255))
    back_s = back.resize((cw, ch), Image.LANCZOS)
    for r in range(5):
        for col in range(2):
            sheet_b.paste(back_s, (mx + col * cw, my + r * ch))
    sheet_b.save(PREVIEW_DIR / "business-cards-sheet-back.png")


def write_html_print_page() -> None:
    """Browser-printable twin of the PDF (same Avery 10-up geometry)."""
    html = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Business cards | East Forsyth Band</title>
  <link rel="icon" href="assets/efhs-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@600;700;900&display=swap" rel="stylesheet">
  <style>
    :root{
      --navy:#002142;
      --gold:#FDD703;
      --red:#E71321;
      --soft:#c7dbf2;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:"Work Sans",system-ui,sans-serif;
      color:var(--navy);
      background:#eef2f7;
    }
    .screen-only{
      max-width:720px;
      margin:0 auto;
      padding:28px 20px 8px;
    }
    .screen-only h1{margin:0 0 8px;font-size:1.8rem;letter-spacing:-.03em}
    .screen-only p{margin:0 0 12px;line-height:1.5;color:#445064}
    .screen-only a{color:var(--navy);font-weight:700}
    .screen-only .actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 8px}
    .screen-only button,.screen-only .btn{
      appearance:none;border:0;cursor:pointer;font:inherit;font-weight:800;
      background:var(--navy);color:#fff;padding:12px 16px;border-radius:999px;text-decoration:none;
    }
    .screen-only .btn.secondary{background:#fff;color:var(--navy);border:2px solid var(--navy)}
    .sheet{
      width:8.5in;
      height:11in;
      margin:18px auto;
      background:#fff;
      box-shadow:0 18px 50px rgba(0,33,66,.16);
      position:relative;
      page-break-after:always;
    }
    .sheet-label{
      position:absolute;top:8px;left:50%;transform:translateX(-50%);
      font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8a93a3;
    }
    .grid{
      position:absolute;
      top:0.5in;left:0.75in;
      width:7in;height:10in;
      display:grid;
      grid-template-columns:repeat(2,3.5in);
      grid-template-rows:repeat(5,2in);
    }
    .card{
      width:3.5in;height:2in;
      overflow:hidden;
      position:relative;
    }
    .card.front{
      background:var(--navy);
      color:#fff;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:0;
      padding:0.18in 0.18in 0.14in;
    }
    .card.front:before{
      content:"";position:absolute;left:0;right:0;top:0;height:0.075in;background:var(--gold);
    }
    .card.front:after{
      content:"";position:absolute;left:0;right:0;top:0.075in;height:0.028in;background:var(--red);
    }
    .logos{display:flex;align-items:center;gap:12px;margin-top:0.08in;margin-bottom:0.08in}
    .logos img.eagle{height:0.55in;width:auto}
    .logos img.mark{height:0.58in;width:0.58in;border-radius:50%}
    .card.front h2{
      margin:0;font-size:15px;font-weight:900;letter-spacing:-.02em;line-height:1.05;text-align:center;
    }
    .card.front .rule{
      width:1.35in;height:1.5px;background:var(--gold);margin:0.08in 0 0.1in;
    }
    .card.front .url{color:var(--gold);font-weight:800;font-size:12px}
    .card.front .tag{
      margin-top:0.1in;font-size:8px;font-weight:700;letter-spacing:.14em;color:var(--soft);
    }
    .card.back{
      background:#fff;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      box-shadow:inset 0 0 0 1.15px var(--navy);
      padding:0.12in;
    }
    .card.back img{width:1.15in;height:1.15in}
    .card.back figcaption{
      margin:0.08in 0 0;font-weight:900;font-size:13px;color:var(--navy);letter-spacing:-.02em;
    }
    @media print{
      body{background:#fff}
      .screen-only{display:none!important}
      .sheet{margin:0;box-shadow:none;page-break-after:always}
      .sheet-label{display:none}
      @page{size:letter;margin:0}
    }
  </style>
</head>
<body>
  <div class="screen-only">
    <h1>Business cards</h1>
    <p>Print on <strong>8.5×11 card stock</strong>. Page 1 is the front; page 2 is the back with the home QR and “Check Us Out!” Use duplex / two-sided printing with <strong>flip on long edge</strong>, then cut on the light guides (10 cards per sheet, Avery 8371-style).</p>
    <div class="actions">
      <button type="button" onclick="window.print()">Print</button>
      <a class="btn secondary" href="assets/downloads/efhsband-business-cards.pdf">Download PDF</a>
      <a class="btn secondary" href="/qr">QR page</a>
    </div>
  </div>

  <section class="sheet" aria-label="Front side">
    <div class="sheet-label">Front — print this side first</div>
    <div class="grid">
"""
    front_card = """      <article class="card front">
        <div class="logos">
          <img class="eagle" src="assets/efhs-logo.png" alt="">
          <img class="mark" src="assets/efhs-blue-regiment-mark.png" alt="">
        </div>
        <h2>East Forsyth Band</h2>
        <div class="rule" aria-hidden="true"></div>
        <div class="url">efhsband.org</div>
        <div class="tag">BLUE REGIMENT</div>
      </article>
"""
    html += front_card * 10
    html += """    </div>
  </section>

  <section class="sheet" aria-label="Back side">
    <div class="sheet-label">Back — duplex flip on long edge</div>
    <div class="grid">
"""
    back_card = """      <figure class="card back">
        <img src="assets/site-home-qr.png" width="240" height="240" alt="QR code to efhsband.org">
        <figcaption>Check Us Out!</figcaption>
      </figure>
"""
    html += back_card * 10
    html += """    </div>
  </section>
</body>
</html>
"""
    OUT_HTML.write_text(html, encoding="utf-8")


def main() -> None:
    if not QR_PATH.exists():
        raise SystemExit(f"Missing QR asset: {QR_PATH}")
    fonts = ensure_fonts()
    logo_im = black_to_transparent(Image.open(LOGO_PATH))
    mark_im = Image.open(MARK_PATH).convert("RGBA")
    qr_im = Image.open(QR_PATH).convert("RGB")
    write_pdf(fonts, logo_im, mark_im, qr_im)
    write_previews(logo_im, mark_im, qr_im)
    write_html_print_page()
    print(f"Wrote {OUT_PDF} ({OUT_PDF.stat().st_size} bytes)")
    print(f"Wrote {OUT_HTML}")


if __name__ == "__main__":
    main()
