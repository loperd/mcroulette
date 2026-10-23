"""Side-by-side sheet of review stills: python3 scripts/review-sheet.py out.png a.png b.png ... (2 per row, labelled)."""
import sys
from PIL import Image, ImageDraw
out, paths = sys.argv[1], sys.argv[2:]
W, H = 960, 540
sheet = Image.new('RGB', (W * min(2, len(paths)), (H + 24) * ((len(paths) + 1) // 2)), '#111')
draw = ImageDraw.Draw(sheet)
for i, p in enumerate(paths):
    x, y = (i % 2) * W, (i // 2) * (H + 24)
    sheet.paste(Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS), (x, y + 24))
    draw.text((x + 8, y + 6), '/'.join(p.split('/')[-2:]), fill='#eee')
sheet.save(out)
