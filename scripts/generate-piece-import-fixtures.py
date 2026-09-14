#!/usr/bin/env python3
"""Regenerate fixtures/piece-import/* (requires pillow+reportlab on PYTHONPATH)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch

ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "piece-import"
ROOT.mkdir(parents=True, exist_ok=True)

TWINKLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Twinkle</work-title></work>
  <identification><creator type="composer">Mozart</creator></identification>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type><sound tempo="100"/></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><accidental>sharp</accidental><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><rest/><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="3">
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="4">
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><rest/><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>
"""

DUET = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Two Staff Study</work-title></work>
  <identification><creator type="composer">MusAI Fixture</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Violin I</part-name></score-part>
    <score-part id="P2"><part-name>Violin II</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <sound tempo="90"/>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>half</type></note>
      <note><rest/><duration>2</duration><type>quarter</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>6</duration><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>
"""

(ROOT / "twinkle.musicxml").write_text(TWINKLE_XML, encoding="utf-8")
(ROOT / "two-staff-study.musicxml").write_text(DUET, encoding="utf-8")

def draw_staff(draw, y0, width=1100, left=80, gap=14):
    for i in range(5):
        y = y0 + i * gap
        draw.line([(left, y), (left + width, y)], fill=(20, 20, 20), width=2)

def draw_notes(draw, y0, xs, heads):
    for x, dy in zip(xs, heads):
        cy = y0 + dy
        draw.ellipse([x - 9, cy - 7, x + 9, cy + 7], fill=(10, 10, 10))
        draw.line([(x + 8, cy), (x + 8, cy - 42)], fill=(10, 10, 10), width=2)

def make_page(title, page_label, notes_dy):
    img = Image.new("RGB", (1400, 1800), (252, 250, 245))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Times New Roman.ttf", 48)
        small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Times New Roman.ttf", 28)
    except Exception:
        font = ImageFont.load_default(); small = font
    draw.text((80, 60), title, fill=(15, 15, 15), font=font)
    draw.text((80, 120), page_label, fill=(80, 80, 80), font=small)
    draw.text((90, 280), "G", fill=(15, 15, 15), font=font)
    draw_staff(draw, 320)
    xs = [220, 340, 460, 580, 700, 820, 940, 1060]
    draw_notes(draw, 320, xs, notes_dy)
    draw.text((160, 330), "4", fill=(15, 15, 15), font=small)
    draw.text((160, 360), "4", fill=(15, 15, 15), font=small)
    return img

page1 = make_page("Twinkle Study", "page 1", [28, 28, 0, 0, -14, 14, 42, 28])
page2 = make_page("Twinkle Study", "page 2", [14, 0, 28, 42, 28, 14, 0, 28])
page1.save(ROOT / "twinkle-scan.png", "PNG")
page1.convert("RGB").save(ROOT / "twinkle-scan.jpg", "JPEG", quality=92)
tmp = ROOT / "_embed.png"
page1.resize((1200, 1540)).save(tmp)
c = canvas.Canvas(str(ROOT / "twinkle-one-page.pdf"), pagesize=letter)
c.drawImage(str(tmp), 0.4 * inch, 0.4 * inch, width=7.7 * inch, height=9.9 * inch)
c.showPage(); c.save()
c = canvas.Canvas(str(ROOT / "twinkle-multi-page.pdf"), pagesize=letter)
for img in (page1, page2):
    img.resize((1200, 1540)).save(tmp)
    c.drawImage(str(tmp), 0.4 * inch, 0.4 * inch, width=7.7 * inch, height=9.9 * inch)
    c.showPage()
c.save()
c = canvas.Canvas(str(ROOT / "not-music.pdf"), pagesize=letter)
c.setFont("Helvetica", 18)
c.drawString(72, 720, "This is a text document, not sheet music.")
c.setFont("Helvetica", 12)
c.drawString(72, 690, "Invoice #1842 — payment due upon receipt.")
c.drawString(72, 670, "Item A ................ $12.00")
c.showPage(); c.save()
tmp.unlink(missing_ok=True)
print("Wrote", ROOT)
for p in sorted(ROOT.iterdir()):
    if p.is_file() and p.suffix != ".md":
        print(f"  {p.name:30} {p.stat().st_size:8d} B")
