"""Optional developer-only reproducible sample label. Requires Pillow.

The normal ElectroCat label generator is built into web/app.js and needs no Pillow.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 384, 352
img = Image.new("L", (W,H), 255)
d = ImageDraw.Draw(img)
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def fit(text, xy, width, size=18, min_size=10, bold=False, fill=0):
    font_file = BOLD if bold else REG
    while size > min_size:
        f = ImageFont.truetype(font_file, size)
        if d.textbbox((0,0),text,font=f)[2] <= width:
            break
        size -= 1
    d.text(xy,text,font=ImageFont.truetype(font_file,size),fill=fill)


d.rectangle((0,0,383,60),fill=0)
fit("AO3400A",(14,9),345,36,22,True,255)
fit("MOSFET  •  N-CHANNEL ENHANCEMENT / TRENCH",(15,67),354,15,11,True)
fit("Very low RDS(on)  /  load switching, PWM",(15,93),354,13,10)
d.rectangle((14,120,370,122),fill=0)
specs = [
    ("VDS max","30 V"),
    ("ID continuous","5.7 A"),
    ("VGS max", "±12 V"),
    ("VGS(th)", "0.65–1.45 V"),
    ("RDS(on) @ 4.5V","≤32 mΩ"),
    ("RDS(on) @ 2.5V","≤48 mΩ"),
]
for i,(label,value) in enumerate(specs):
    y = 134+27*i
    fit(label,(15,y),153,14,11,True)
    fit(value,(170,y),85,14,10,True)
    d.line((15,y+24,250,y+24),fill=220,width=1)
fit("TOP VIEW",(279,132),92,12,10,True)
d.rectangle((279,191,347,251),fill=0)
d.rectangle((302,177,324,193),fill=0)
d.rectangle((288,251,300,272),fill=0)
d.rectangle((327,251,339,272),fill=0)
fit("SOT-23",(287,213),57,10,8,True,255)
fit("3:D",(294,156),70,14,11,True)
fit("1:G",(263,279),55,13,10,True)
fit("2:S",(320,279),58,13,10,True)
fit("VGS(th) ≠ fully ON",(16,305),231,13,10,True)
d.rectangle((0,332,383,351),fill=0)
fit("PACKAGE: SOT-23",(13,335),216,12,10,True,255)
fit("EC-0001",(308,335),66,12,10,True,255)
img = img.point(lambda x: 255 if x >= 158 else 0, mode="1")
img.save(HERE / "AO3400A.png", format="PNG", optimize=True)
print(HERE / "AO3400A.png", img.size, img.mode)
